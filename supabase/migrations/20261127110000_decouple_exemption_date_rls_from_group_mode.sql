-- 解耦 public.exemption_request_date 读策略与已退役集团模式 3 参函数的强依赖（C8）。
--
-- 背景：
--   1. 20260902100000_exemption_daily_review.sql 在 public.exemption_request_date 上创建的
--      SELECT RLS 策略 "成员或管理员读取申请日期明细" 直接调用了 3 参旧函数
--      public.exemption_target_in_active_scope((auth.uid())::uuid, r.applicant_user_id, null)。
--   2. 集团模式退役迁移 20261016090000_remove_group_mode.sql 尝试删除 3 参旧函数时，
--      被这条策略的 pg_depend 强依赖阻断，因此长期处于 not_applied 状态。
--   3. 且旧版 3 参函数的第 3 参数带 DEFAULT NULL，若直接新增 2 参同名重载而不去掉旧 3 参的默认值，
--      PostgreSQL 会对 2 参调用报 "is not unique" 歧义错误。
--
-- 本迁移保持 100% 向后兼容与幂等（同时兼容 CloudBase PG auth.uid() 返回 text 与本地演练库返回 uuid）：
--   1. 先移除旧策略 "成员或管理员读取申请日期明细"，释放对 3 参旧函数的唯一 pg_depend 依赖。
--   2. 创建 2 参单公司作用域函数 public.exemption_target_in_active_scope(p_actor_id uuid, p_target_id uuid)，
--      委托给已收敛为单公司作用域的 public.active_visible_user_ids(p_actor_id)（零集团模式参数，自动继承线上活性校验）。
--   3. 若当前库仍存在旧 3 参函数（尚未执行集团模式清理迁移），将其重建为不带 DEFAULT 的纯 3 参过渡包装并委托给 2 参函数：
--      - 消除 2 参调用重载歧义；
--      - 保证线上尚未切换的旧 3 参 RPC 零停机兼容；
--      - 不再依赖 is_group_mode_active，且后续执行 DROP FUNCTION public.exemption_target_in_active_scope(uuid, uuid, text) 零阻断；
--      - 若目标库已清理过 3 参旧函数，则不会重新创建它。
--   4. 用 2 参函数重建 "成员或管理员读取申请日期明细" 读策略。

alter table public.exemption_request_date enable row level security;

drop policy if exists "成员或管理员读取申请日期明细" on public.exemption_request_date;

create or replace function public.exemption_target_in_active_scope(
  p_actor_id uuid,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.active_visible_user_ids(p_actor_id) visible
    where visible.user_id = p_target_id
  );
$$;

revoke all on function public.exemption_target_in_active_scope(uuid, uuid) from public, anon, service_role;
grant execute on function public.exemption_target_in_active_scope(uuid, uuid) to authenticated, service_role;

comment on function public.exemption_target_in_active_scope(uuid, uuid) is
  '单公司作用域判断（无集团模式参数）：校验 p_target_id 是否位于 p_actor_id 的在职可见范围内。';

do $$
begin
  if to_regprocedure('public.exemption_target_in_active_scope(uuid,uuid,text)') is not null then
    drop function public.exemption_target_in_active_scope(uuid, uuid, text);
    create function public.exemption_target_in_active_scope(
      p_actor_id uuid,
      p_target_id uuid,
      p_group_mode_token_hash text
    )
    returns boolean
    language sql
    stable
    security definer
    set search_path = pg_catalog, public
    as $compat$
      select public.exemption_target_in_active_scope(p_actor_id, p_target_id);
    $compat$;
    revoke all on function public.exemption_target_in_active_scope(uuid, uuid, text) from public, anon, service_role;
    grant execute on function public.exemption_target_in_active_scope(uuid, uuid, text) to authenticated, service_role;
    comment on function public.exemption_target_in_active_scope(uuid, uuid, text) is
      '集团模式退役前的过渡兼容重载（已移除 DEFAULT 与集团模式分支，无任何策略依赖，可在后续集团模式清理迁移中直接删除）。';
  end if;
end
$$;

create policy "成员或管理员读取申请日期明细"
  on public.exemption_request_date for select to authenticated
  using (
    exists (
      select 1
      from public.exemption_request r
      where r.id = exemption_request_date.request_id
        and (
          r.applicant_user_id = (auth.uid())::uuid
          or public.is_owner()
          or public.exemption_target_in_active_scope((auth.uid())::uuid, r.applicant_user_id)
        )
    )
  );

comment on policy "成员或管理员读取申请日期明细" on public.exemption_request_date is
  '员工可读本人申请日期明细；同公司管理员/所有者按 2 参单公司作用域与父表 b3_exemption_request_select_scope 联合读取，不依赖集团模式旧函数。';
