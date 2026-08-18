-- 20260818: 豁免当前操作收口到 active_visible_user_ids
-- 目标：历史读取继续保留 visible_user_ids，当前审批/授予/清除切到 active_visible_user_ids。

create or replace function public.active_visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_scope text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if p_actor_id is null then
    return;
  end if;

  select *
  into v_actor
  from public.profiles
  where id = p_actor_id;

  if not found then
    return;
  end if;

  if coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_scope := coalesce(v_actor.data_scope, 'self');

  if v_scope = 'all' then
    return query
    select p.id
    from public.profiles p
    where coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query
    select p.id
    from public.profiles p
    where p.team_id = v_actor.team_id
      and coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  return query
  select v_actor.id;
end;
$$;

create or replace function public.apply_exemption_grant_atomically(
  p_user_id uuid,
  p_grant_start_date date,
  p_grant_end_date date,
  p_grant_type text,
  p_exemption_category text,
  p_reason text,
  p_replace_existing boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  if v_actor.role <> 'owner'
    and not (
      (public.has_permission('manage_fulfillment') or public.has_permission('review_violations'))
      and exists (
        select 1
        from public.active_visible_user_ids(v_actor.id) vis
        where vis.user_id = p_user_id
      )
    ) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  if p_grant_type is null
    or p_grant_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
    raise exception using errcode = '22023', message = '豁免类型不正确';
  end if;

  if p_exemption_category is null
    or p_exemption_category not in ('waive', 'leave') then
    raise exception using errcode = '22023', message = '豁免分类不正确';
  end if;

  if p_grant_type = 'permanent' then
    if p_grant_start_date is null or p_grant_end_date is not null then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;

    if nullif(trim(p_reason), '') is null then
      raise exception using errcode = '22023', message = '永久豁免必须填写原因';
    end if;
  elsif p_grant_start_date is null
    or p_grant_end_date is null
    or p_grant_start_date > p_grant_end_date then
    raise exception using errcode = '22023', message = '豁免日期不正确';
  end if;

  if p_replace_existing or p_grant_type = 'permanent' then
    update public.exemption_grant
    set status = 'inactive'
    where user_id = p_user_id
      and status = 'active';
  end if;

  insert into public.exemption_grant (
    request_id,
    user_id,
    team_id,
    start_date,
    end_date,
    grant_type,
    exemption_category,
    status
  ) values (
    null,
    p_user_id,
    v_target.team_id,
    p_grant_start_date,
    p_grant_end_date,
    p_grant_type,
    p_exemption_category,
    'active'
  )
  returning id into v_grant_id;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = case when p_grant_type = 'permanent' then 'exempt' else 'active' end,
    exempt_type = case when p_grant_type = 'permanent' then 'permanent' else 'temporary' end,
    exempt_start_date = case when p_grant_type = 'permanent' then null else p_grant_start_date end,
    exempt_end_date = case when p_grant_type = 'permanent' then null else p_grant_end_date end,
    exempt_reason = nullif(trim(p_reason), ''),
    exemption_category = p_exemption_category
  where id = p_user_id;

  return jsonb_build_object('grant_id', v_grant_id, 'user_id', p_user_id);
end;
$$;

create or replace function public.clear_exemption_grant_atomically(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  if v_actor.role <> 'owner'
    and not (
      (public.has_permission('manage_fulfillment') or public.has_permission('review_violations'))
      and exists (
        select 1
        from public.active_visible_user_ids(v_actor.id) vis
        where vis.user_id = p_user_id
      )
    ) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  update public.exemption_grant
  set status = 'inactive'
  where user_id = p_user_id
    and status = 'active';

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = 'active',
    exempt_type = null,
    exempt_start_date = null,
    exempt_end_date = null,
    exempt_reason = null,
    exemption_category = null
  where id = p_user_id;

  return jsonb_build_object('user_id', p_user_id, 'cleared', true);
end;
$$;

create or replace function public.review_exemption_request_atomically(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_request public.exemption_request%rowtype;
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '审核决定不正确';
  end if;

  select * into v_actor
  from public.profiles
  where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  if v_actor.role <> 'owner'
    and not (
      public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations')
    ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select request_row.*
  into v_request
  from public.exemption_request request_row
  where request_row.id = p_request_id
    and (
      v_actor.role = 'owner'
      or exists (
        select 1
        from public.active_visible_user_ids(v_actor.id) vis
        where vis.user_id = request_row.applicant_user_id
      )
    )
  for update of request_row;
  if not found then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), v_request.applicant_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_target
  from public.profiles
  where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;

  if v_actor.role <> 'owner'
    and not (
      (public.has_permission('manage_fulfillment') or public.has_permission('review_violations'))
      and exists (
        select 1
        from public.active_visible_user_ids(v_actor.id) vis
        where vis.user_id = v_request.applicant_user_id
      )
    ) then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  if v_request.request_status <> 'pending' then
    raise exception using errcode = 'P0001', message = '该申请已处理';
  end if;

  if p_decision = 'approved' then
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

      update public.exemption_grant
      set status = 'inactive'
      where user_id = v_target.id
        and status = 'active';
    elsif v_request.start_date is null
      or v_request.end_date is null
      or v_request.start_date > v_request.end_date then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;

    insert into public.exemption_grant (
      request_id,
      user_id,
      team_id,
      start_date,
      end_date,
      grant_type,
      exemption_category,
      status
    ) values (
      v_request.id,
      v_target.id,
      v_target.team_id,
      v_request.start_date,
      v_request.end_date,
      v_request.exemption_type,
      v_request.exemption_category,
      'active'
    )
    returning id into v_grant_id;

    perform set_config('dydata.exemption_write_authorized', '1', true);
    update public.profiles
    set
      status = case when v_request.exemption_type = 'permanent' then 'exempt' else 'active' end,
      exempt_type = case when v_request.exemption_type = 'permanent' then 'permanent' else 'temporary' end,
      exempt_start_date = case when v_request.exemption_type = 'permanent' then null else v_request.start_date end,
      exempt_end_date = case when v_request.exemption_type = 'permanent' then null else v_request.end_date end,
      exempt_reason = nullif(trim(v_request.reason), ''),
      exemption_category = v_request.exemption_category
    where id = v_target.id;
  end if;

  update public.exemption_request
  set
    request_status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'grant_id', v_grant_id
  );
end;
$$;

revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) from public;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) from anon;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) from service_role;
grant execute on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) to authenticated;

revoke all on function public.clear_exemption_grant_atomically(uuid) from public;
revoke all on function public.clear_exemption_grant_atomically(uuid) from anon;
revoke all on function public.clear_exemption_grant_atomically(uuid) from service_role;
grant execute on function public.clear_exemption_grant_atomically(uuid) to authenticated;

revoke all on function public.review_exemption_request_atomically(uuid, text) from public;
revoke all on function public.review_exemption_request_atomically(uuid, text) from anon;
revoke all on function public.review_exemption_request_atomically(uuid, text) from service_role;
grant execute on function public.review_exemption_request_atomically(uuid, text) to authenticated;

revoke all on function public.active_visible_user_ids(uuid) from public;
revoke all on function public.active_visible_user_ids(uuid) from anon;
revoke all on function public.active_visible_user_ids(uuid) from service_role;
grant execute on function public.active_visible_user_ids(uuid) to authenticated, service_role;
