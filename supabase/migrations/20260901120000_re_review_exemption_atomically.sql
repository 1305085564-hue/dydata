-- 原子改判 RPC：仅允许把已审批(approved/rejected)的豁免申请改判为相反状态。
--
-- 背景：历史 re-review 逻辑直接 UPDATE 状态后分开改 grant/profile（非原子），
-- 且通过 service-role 调用受 auth.uid() 保护的原子 RPC 必然 42501 失败；
-- 拒绝时按 user_id+start_date 停用 grant（范围过大），通过时 replaceExisting
-- 会清掉用户所有其他日期的 active grant（误删历史豁免）。
--
-- 本 RPC 一事务内完成：
--   1. 锁定 request 行 FOR UPDATE（并发改判互斥）
--   2. 仅允许当前状态 approved/rejected，且新决策必须相反
--   3. 禁止审核自己发起的申请
--   4. 目标成员已归档则拒绝
--   5. 复用登录会话 + 范围校验（active scope / manage_fulfillment / review_violations）
--   6. 拒绝：只停用当前 request 对应的 grant（request_id = 本申请）
--   7. 通过：只恢复当前 request 对应的 grant（UPDATE 既有 inactive 行，
--      避开 exemption_grant_request_id_unique 部分唯一索引）
--   8. Profile 豁免投影依据剩余 active grant 重算（永久优先，否则最新 active）
--   9. 更新 request 状态/审核人/审核时间 同一事务
create or replace function public.re_review_exemption_request_atomically(
  p_request_id uuid,
  p_decision text,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_grant public.exemption_grant%rowtype;
  v_grant_id uuid;
  v_remaining_grant public.exemption_grant%rowtype;
  v_remaining_reason text;
  v_remaining_category text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;
  select * into v_actor from public.profiles where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') <> 'active' then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '审核决定不正确';
  end if;
  if not (
    (public.is_group_mode_active(p_group_mode_token_hash)
      or public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations'))
    and public.exemption_target_in_active_scope(auth.uid(), auth.uid(), p_group_mode_token_hash)
  ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select request_row.*
  into v_request
  from public.exemption_request request_row
  where request_row.id = p_request_id
    and request_row.applicant_user_id <> auth.uid()
    and public.exemption_target_in_active_scope(auth.uid(), request_row.applicant_user_id, p_group_mode_token_hash)
  for update of request_row;
  if not found then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), v_request.applicant_user_id)
  order by id
  for update;

  select * into v_target from public.profiles where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if not public.exemption_target_in_active_scope(auth.uid(), v_target.id, p_group_mode_token_hash) then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;
  if v_request.request_status is null
    or v_request.request_status not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = '仅支持改判已审批的申请';
  end if;
  if v_request.request_status = p_decision then
    raise exception using errcode = 'P0001', message = '该申请已处理';
  end if;

  if p_decision = 'rejected' then
    -- 只停用当前 request 对应的 grant，不影响用户其他日期的历史豁免
    select grant_row.* into v_grant
    from public.exemption_grant grant_row
    where grant_row.request_id = p_request_id
    for update of grant_row;
    if found then
      if v_grant.status = 'active' then
        update public.exemption_grant
        set status = 'inactive'
        where id = v_grant.id;
      end if;
    end if;
  else
    if v_request.team_id is distinct from v_target.team_id then
      raise exception using errcode = 'P0001', message = '申请人与团队不一致';
    end if;
    if v_request.exemption_type is null
      or v_request.exemption_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
      raise exception using errcode = '22023', message = '豁免类型不正确';
    end if;
    if v_request.exemption_category is null
      or v_request.exemption_category not in ('waive', 'leave') then
      raise exception using errcode = '22023', message = '豁免分类不正确';
    end if;
    if v_request.exemption_type = 'permanent' then
      if v_request.start_date is null or v_request.end_date is not null then
        raise exception using errcode = '22023', message = '豁免日期不正确';
      end if;
      if nullif(trim(v_request.reason), '') is null then
        raise exception using errcode = '22023', message = '永久豁免必须填写原因';
      end if;
    elsif v_request.start_date is null or v_request.end_date is null
      or v_request.start_date > v_request.end_date then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;
    -- 通过：恢复当前 request 对应的 grant（UPDATE 既有 inactive 行，避开部分唯一索引）
    select grant_row.* into v_grant
    from public.exemption_grant grant_row
    where grant_row.request_id = p_request_id
    for update of grant_row;
    if found then
      update public.exemption_grant
      set
        user_id = v_target.id,
        team_id = v_target.team_id,
        start_date = v_request.start_date,
        end_date = v_request.end_date,
        grant_type = v_request.exemption_type,
        exemption_category = v_request.exemption_category,
        status = 'active'
      where id = v_grant.id
      returning id into v_grant_id;
    else
      insert into public.exemption_grant (
        request_id, user_id, team_id, start_date, end_date, grant_type,
        exemption_category, status
      ) values (
        v_request.id, v_target.id, v_target.team_id, v_request.start_date,
        v_request.end_date, v_request.exemption_type, v_request.exemption_category, 'active'
      ) returning id into v_grant_id;
    end if;
  end if;

  -- Profile 豁免投影依据剩余 active grant 重算：永久优先，否则最新 active
  select grant_row.* into v_remaining_grant
  from public.exemption_grant grant_row
  where grant_row.user_id = v_target.id
    and grant_row.status = 'active'
  order by (grant_row.grant_type = 'permanent') desc, grant_row.created_at desc
  limit 1;

  v_remaining_reason := null;
  v_remaining_category := v_remaining_grant.exemption_category;
  if v_remaining_grant.id is not null then
    -- The grant row always exists here. LEFT JOIN keeps manual grants
    -- (request_id IS NULL) and broken legacy links on their own category.
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
    set
      status = 'active',
      exempt_type = null,
      exempt_start_date = null,
      exempt_end_date = null,
      exempt_reason = null,
      exemption_category = null
    where id = v_target.id;
  elsif v_remaining_grant.grant_type = 'permanent' then
    update public.profiles
    set
      status = 'exempt',
      exempt_type = 'permanent',
      exempt_start_date = null,
      exempt_end_date = null,
      exempt_reason = v_remaining_reason,
      exemption_category = v_remaining_category
    where id = v_target.id;
  else
    update public.profiles
    set
      status = 'active',
      exempt_type = 'temporary',
      exempt_start_date = v_remaining_grant.start_date,
      exempt_end_date = v_remaining_grant.end_date,
      exempt_reason = v_remaining_reason,
      exemption_category = v_remaining_category
    where id = v_target.id;
  end if;

  update public.exemption_request
  set request_status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'grant_id', v_grant_id
  );
end;
$$;

revoke all on function public.re_review_exemption_request_atomically(uuid, text, text) from public, anon, service_role;
grant execute on function public.re_review_exemption_request_atomically(uuid, text, text) to authenticated;

-- 上线前只读检查（发现结果时先人工处理，不要删除或覆盖申请）：
-- select request_status, count(*) from public.exemption_request group by request_status;
-- select a.id, b.id, a.applicant_user_id, a.exemption_category, a.start_date, a.end_date, b.start_date, b.end_date
-- from public.exemption_request a join public.exemption_request b
--   on a.id < b.id and a.applicant_user_id = b.applicant_user_id
--  and coalesce(a.exemption_category, 'waive') = coalesce(b.exemption_category, 'waive')
--  and a.request_status = 'pending' and b.request_status = 'pending'
--  and daterange(a.start_date, coalesce(a.end_date, a.start_date), '[]') && daterange(b.start_date, coalesce(b.end_date, b.start_date), '[]');
-- 跨标签页/跨实例重复提交防护：同一申请人在 pending 期间不得重叠提交同一分类日期。
-- 用可重叠的范围约束（btree_gist），比「完全相同才拦截」更强，比「有任意 pending 就禁止」更宽松；
-- REST 接口与 Server Action 的应用层检查只是体验优化，这里才是最终兜底。
create extension if not exists btree_gist;

do $$
begin
  if exists (
    select 1
    from public.exemption_request a
    join public.exemption_request b
      on a.id < b.id
     and a.applicant_user_id = b.applicant_user_id
     and coalesce(a.exemption_category, 'waive') = coalesce(b.exemption_category, 'waive')
     and a.request_status = 'pending'
     and b.request_status = 'pending'
     and daterange(a.start_date, coalesce(a.end_date, a.start_date), '[]')
       && daterange(b.start_date, coalesce(b.end_date, b.start_date), '[]')
  ) then
    raise exception using errcode = '23514', message = '存在重叠的待审批申请，请先人工处理';
  end if;
end;
$$;

alter table public.exemption_request
  drop constraint if exists exemption_request_no_overlap_pending;

alter table public.exemption_request
  add constraint exemption_request_no_overlap_pending
  exclude using gist (
    applicant_user_id with =,
    (coalesce(exemption_category, 'waive')) with =,
    daterange(start_date, coalesce(end_date, start_date), '[]') with &&
  )
  where (request_status = 'pending');
