-- 审批「打回待处理」（2026-09-02 与阿禅对齐）：
-- 已处理记录的操作不再是「同意↔拒绝」互相翻案，而是把申请整单打回 pending，
-- 退回「待审批申请」队列重新走审批流程。
-- 1. drop 旧改判 RPC re_review_exemption_request_atomically（翻案语义已废弃，无其他调用方）。
-- 2. 新建 reopen_exemption_request_atomically：撤销该申请产生的全部 active grant、
--    逐日明细全部重置回 pending、申请单回到 pending（清空审阅人/时间），
--    并按剩余 active grant 重算 profiles 豁免投影（成员恢复非豁免，除非还有其他生效豁免）。
-- 3. 打回前校验与 pending 重叠排除约束一致：若该成员已有日期重叠的待审批申请，
--    直接报业务错误，避免撞 exemption_request_no_overlap_pending 约束产生裸 SQL 报错。

drop function if exists public.re_review_exemption_request_atomically(uuid, text, text);

create or replace function public.reopen_exemption_request_atomically(
  p_request_id uuid,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_remaining_grant public.exemption_grant%rowtype;
  v_remaining_reason text;
  v_remaining_category text;
  v_grant_count int := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;
  if not (
    public.has_permission('manage_fulfillment')
    or public.has_permission('review_violations')
    or public.is_group_mode_active(p_group_mode_token_hash)
  ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_request
  from public.exemption_request
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;
  if v_request.applicant_user_id = auth.uid()
    or not public.exemption_target_in_active_scope(auth.uid(), v_request.applicant_user_id, p_group_mode_token_hash) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  select * into v_target from public.profiles where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;

  if v_request.request_status not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = '仅支持打回已审批的申请';
  end if;

  -- 打回即重新进入 pending，必须先过与排除约束同口径的重叠检查，
  -- 否则会在 update 时撞 exemption_request_no_overlap_pending 抛裸约束错误。
  if exists (
    select 1 from public.exemption_request other
    where other.applicant_user_id = v_request.applicant_user_id
      and other.id <> p_request_id
      and other.request_status = 'pending'
      and daterange(v_request.start_date, coalesce(v_request.end_date, v_request.start_date), '[]')
          && daterange(other.start_date, coalesce(other.end_date, other.start_date), '[]')
  ) then
    raise exception using errcode = '23P01', message = '该成员已有重叠的待审批申请，无法打回';
  end if;

  -- 存量单可能没有逐日明细（旧链路），先按区间补齐再整体重置，保证打回后逐日审批可用。
  insert into public.exemption_request_date (request_id, request_date, reason, status)
  select v_request.id, gs::date, v_request.reason, 'pending'
  from generate_series(v_request.start_date, coalesce(v_request.end_date, v_request.start_date), interval '1 day') gs
  on conflict (request_id, request_date) do nothing;

  update public.exemption_request_date
  set status = 'pending', feedback = null, reviewed_by = null, reviewed_at = null
  where request_id = p_request_id;

  -- 撤销该申请产生的全部 grant（逐日模型一 request 多行，整组停用）。
  update public.exemption_grant
  set status = 'inactive'
  where request_id = p_request_id and status = 'active';
  get diagnostics v_grant_count = row_count;

  update public.exemption_request
  set request_status = 'pending', reviewed_by = null, reviewed_at = null
  where id = p_request_id;

  -- 按剩余 active grant 重算 profiles 豁免投影（永久优先，否则最新 active），与逐日审批同一口径。
  select grant_row.* into v_remaining_grant
  from public.exemption_grant grant_row
  where grant_row.user_id = v_target.id
    and grant_row.status = 'active'
  order by (grant_row.grant_type = 'permanent') desc, grant_row.created_at desc
  limit 1;

  v_remaining_reason := null;
  v_remaining_category := v_remaining_grant.exemption_category;
  if v_remaining_grant.id is not null then
    select
      request_row.reason,
      case
        when request_row.id is null then grant_row.exemption_category
        else request_row.exemption_category
      end
    into v_remaining_reason, v_remaining_category
    from public.exemption_grant grant_row
    left join public.exemption_request request_row
      on request_row.id = grant_row.request_id
    where grant_row.id = v_remaining_grant.id;
  end if;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  if v_remaining_grant.id is null then
    update public.profiles
    set status = 'active', exempt_type = null, exempt_start_date = null,
        exempt_end_date = null, exempt_reason = null, exemption_category = null
    where id = v_target.id;
  elsif v_remaining_grant.grant_type = 'permanent' then
    update public.profiles
    set status = 'exempt', exempt_type = 'permanent', exempt_start_date = null,
        exempt_end_date = null, exempt_reason = v_remaining_reason, exemption_category = v_remaining_category
    where id = v_target.id;
  else
    update public.profiles
    set status = 'active', exempt_type = 'temporary', exempt_start_date = v_remaining_grant.start_date,
        exempt_end_date = v_remaining_grant.end_date, exempt_reason = v_remaining_reason, exemption_category = v_remaining_category
    where id = v_target.id;
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'reopened', true,
    'revoked_grant_count', v_grant_count
  );
end;
$$;

revoke all on function public.reopen_exemption_request_atomically(uuid, text) from public, anon, service_role;
grant execute on function public.reopen_exemption_request_atomically(uuid, text) to authenticated;
