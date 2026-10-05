-- 20261005：修复 handle_fulfillment_appeal 双重重载导致的解析歧义（补交审批线上必 500 的根因）。
--
-- 症状：线上同时存在同名两个版本
--   handle_fulfillment_appeal(uuid, text, uuid)              -- 20260903153000 建立
--   handle_fulfillment_appeal(uuid, text, uuid, text)       -- 20261003095010 新增的包裹层
-- 两个版本的尾部参数都带 DEFAULT，PostgreSQL 不会在「参数个数正好」与「靠 DEFAULT 补齐」之间排序，
-- 于是任何 3 实参调用（含 4 参包裹层体内那行 `result := public.handle_fulfillment_appeal(a, b, c)`）都报：
--   ERROR: function public.handle_fulfillment_appeal(uuid, text, uuid) is not unique (SQLSTATE 42725)
-- 因为该报错发生在 4 参函数体的第一条语句，凡是走 4 参入口的补交审批（同意/驳回）都整体失败，
-- 路由侧表现为 500 RPC_FAILED；而 20261003095010 之后的新代码恰恰改传了 p_reason，命中的就是这个入口。
--
-- 修法（治本：把重叠的两个入口合成唯一一个）：
--   1) 4 参版本改为判定主体本身（原 3 参函数体 + decision_reason 合并进同一条 UPDATE，仍只写一行、
--      仍只插一条 audit_logs、仍按 pending 幂等报错）；
--   2) 删除 3 参版本 —— 只剩一个同名函数后，PostgREST 传 3 个命名参数会靠 DEFAULT 补齐解析到它，
--      老调用方行为不变，且从根上不再有可歧义的候选集。
-- 依赖核对：改动前 `pg_depend` 中两个签名均无外部依赖方（本地与线上均为 0 行），删除 3 参版本安全。
-- 权限：保留的 4 参版本沿用原有 ACL，这里再显式收口一次（幂等）。

create or replace function public.handle_fulfillment_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_handler_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  resolved_status text;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  resolved_handler_id := coalesce(
    p_handler_id,
    auth.uid()
  );

  select * into appeal_record
  from public.fulfillment_appeals
  where id = p_appeal_id
  for update;

  if not found then
    raise exception 'appeal not found';
  end if;

  if appeal_record.status <> 'pending' then
    raise exception 'appeal already handled';
  end if;

  resolved_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  update public.fulfillment_appeals
  set status = resolved_status,
      handler_id = resolved_handler_id,
      handled_at = now(),
      decision_reason = case when p_decision = 'reject' then nullif(left(coalesce(p_reason, ''), 1000), '') else null end
  where id = appeal_record.id;

  if resolved_handler_id is not null then
    insert into public.audit_logs (user_id, action, target, detail)
    values (
      resolved_handler_id,
      'handle_fulfillment_appeal',
      appeal_record.user_id::text,
      jsonb_build_object(
        'appeal_id', appeal_record.id,
        'account_id', appeal_record.account_id,
        'record_date', appeal_record.record_date,
        'decision', resolved_status
      )::text
    );
  end if;

  return jsonb_build_object(
    'id', appeal_record.id,
    'status', resolved_status,
    'account_id', appeal_record.account_id,
    'record_date', appeal_record.record_date,
    'user_id', appeal_record.user_id
  );
end;
$$;

-- 删掉重叠的 3 参版本（上一条 CREATE OR REPLACE 已让 4 参版本不再引用它，删除不会级联失败）。
drop function if exists public.handle_fulfillment_appeal(uuid, text, uuid);

revoke all on function public.handle_fulfillment_appeal(uuid, text, uuid, text) from public, anon;
grant execute on function public.handle_fulfillment_appeal(uuid, text, uuid, text) to authenticated, service_role;
