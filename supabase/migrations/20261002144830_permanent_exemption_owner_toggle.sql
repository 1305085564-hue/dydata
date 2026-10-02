-- Owner-only direct toggle for the existing permanent exemption projection.
-- Temporary grants remain active while the permanent marker is enabled so that
-- clearing the permanent marker can restore the previous temporary state.

create or replace function public.set_permanent_exemption_owner_atomically(
  p_user_id uuid,
  p_reason text,
  p_group_mode_token_hash text default null
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
    raise exception using errcode = '42501', message = '仅公司所有者可设置不参与考核';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found
    or coalesce(v_actor.membership_status, 'active') = 'archived'
    or public.company_role_for_user(auth.uid()) <> 'company_owner' then
    raise exception using errcode = '42501', message = '仅公司所有者可设置不参与考核';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  if not public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = '永久豁免必须填写原因';
  end if;

  update public.exemption_grant
  set status = 'inactive'
  where user_id = p_user_id
    and grant_type = 'permanent'
    and status = 'active';

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
    current_date,
    null,
    'permanent',
    'waive',
    'active'
  )
  returning id into v_grant_id;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = 'exempt',
    exempt_type = 'permanent',
    exempt_start_date = null,
    exempt_end_date = null,
    exempt_reason = nullif(trim(p_reason), ''),
    exemption_category = 'waive'
  where id = p_user_id;

  insert into public.audit_logs (user_id, action, target, detail)
  values (
    auth.uid(),
    'set_permanent_exemption',
    p_user_id::text,
    jsonb_build_object(
      'grant_id', v_grant_id,
      'reason', nullif(trim(p_reason), ''),
      'company_role', 'company_owner'
    )::text
  );

  return jsonb_build_object(
    'grant_id', v_grant_id,
    'user_id', p_user_id,
    'permanent', true
  );
end;
$$;

create or replace function public.clear_permanent_exemption_owner_atomically(
  p_user_id uuid,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_temp public.exemption_grant%rowtype;
  v_had_permanent boolean;
  v_has_temp boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '仅公司所有者可设置不参与考核';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found
    or coalesce(v_actor.membership_status, 'active') = 'archived'
    or public.company_role_for_user(auth.uid()) <> 'company_owner' then
    raise exception using errcode = '42501', message = '仅公司所有者可设置不参与考核';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  if not public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  select exists (
    select 1
    from public.exemption_grant
    where user_id = p_user_id
      and grant_type = 'permanent'
      and status = 'active'
  ) into v_had_permanent;

  update public.exemption_grant
  set status = 'inactive'
  where user_id = p_user_id
    and grant_type = 'permanent'
    and status = 'active';

  if not v_had_permanent then
    insert into public.audit_logs (user_id, action, target, detail)
    values (auth.uid(), 'clear_permanent_exemption', p_user_id::text,
      jsonb_build_object('cleared', false, 'restored_temporary', false, 'company_role', 'company_owner')::text);
    return jsonb_build_object('user_id', p_user_id, 'cleared', false, 'restored_temporary', false);
  end if;

  select *
  into v_temp
  from public.exemption_grant
  where user_id = p_user_id
    and grant_type <> 'permanent'
    and status = 'active'
    and start_date <= current_date
    and end_date >= current_date
  order by created_at desc nulls last, id desc
  limit 1;
  v_has_temp := found;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  if v_has_temp then
    update public.profiles
    set
      status = 'active',
      exempt_type = 'temporary',
      exempt_start_date = v_temp.start_date,
      exempt_end_date = v_temp.end_date,
      exempt_reason = null,
      exemption_category = v_temp.exemption_category
    where id = p_user_id;
  else
    update public.profiles
    set
      status = 'active',
      exempt_type = null,
      exempt_start_date = null,
      exempt_end_date = null,
      exempt_reason = null,
      exemption_category = null
    where id = p_user_id;
  end if;

  insert into public.audit_logs (user_id, action, target, detail)
  values (
    auth.uid(),
    'clear_permanent_exemption',
    p_user_id::text,
    jsonb_build_object(
      'restored_temporary', v_has_temp,
      'temporary_start_date', case when v_has_temp then v_temp.start_date else null end,
      'temporary_end_date', case when v_has_temp then v_temp.end_date else null end,
      'temporary_category', case when v_has_temp then v_temp.exemption_category else null end,
      'company_role', 'company_owner'
    )::text
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'cleared', true,
    'restored_temporary', v_has_temp,
    'temporary_start_date', case when v_has_temp then v_temp.start_date else null end,
    'temporary_end_date', case when v_has_temp then v_temp.end_date else null end,
    'temporary_category', case when v_has_temp then v_temp.exemption_category else null end
  );
end;
$$;

revoke all on function public.set_permanent_exemption_owner_atomically(uuid, text, text) from public, anon, service_role;
revoke all on function public.clear_permanent_exemption_owner_atomically(uuid, text) from public, anon, service_role;
grant execute on function public.set_permanent_exemption_owner_atomically(uuid, text, text) to authenticated;
grant execute on function public.clear_permanent_exemption_owner_atomically(uuid, text) to authenticated;
