-- Permanent exemption is a projection with higher priority than every temporary grant.
-- Keep temporary grants for later restoration, but never let a temporary write
-- overwrite an active permanent projection.

create or replace function public.guard_profile_exemption_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_permanent public.profiles%rowtype;
begin
  if (
    new.status is distinct from old.status
    or new.exempt_type is distinct from old.exempt_type
    or new.exempt_start_date is distinct from old.exempt_start_date
    or new.exempt_end_date is distinct from old.exempt_end_date
    or new.exempt_reason is distinct from old.exempt_reason
    or new.exemption_category is distinct from old.exemption_category
  ) and coalesce(current_setting('dydata.exemption_write_authorized', true), '') <> '1'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = '豁免字段只能通过授权流程修改';
  end if;

  if new.exempt_type = 'temporary'
    and exists (
      select 1 from public.exemption_grant
      where user_id = new.id and grant_type = 'permanent' and status = 'active'
    ) then
    select * into v_permanent from public.profiles where id = new.id;
    new.status := 'exempt';
    new.exempt_type := 'permanent';
    new.exempt_start_date := null;
    new.exempt_end_date := null;
    new.exempt_reason := v_permanent.exempt_reason;
    new.exemption_category := 'waive';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_exemption_projection() from public, anon, authenticated;

create or replace function public.apply_exemption_grant_atomically_v2(
  p_user_id uuid,
  p_grant_start_date date,
  p_grant_end_date date,
  p_grant_type text,
  p_exemption_category text,
  p_reason text,
  p_replace_existing boolean,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target public.profiles%rowtype;
  v_grant_id uuid;
  v_has_permanent boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1 from public.profiles where id in (auth.uid(), p_user_id) order by id for update;
  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived'
    or not public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash)
    or not (
      public.is_group_mode_active(p_group_mode_token_hash)
      or public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations')
    ) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  if p_grant_type is null or p_grant_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
    raise exception using errcode = '22023', message = '豁免类型不正确';
  end if;
  if p_exemption_category is null or p_exemption_category not in ('waive', 'leave') then
    raise exception using errcode = '22023', message = '豁免分类不正确';
  end if;
  if p_grant_type = 'permanent' then
    if public.company_role_for_user(auth.uid()) <> 'company_owner' then
      raise exception using errcode = '42501', message = '仅公司所有者可设置不参与考核';
    end if;
    if p_grant_start_date is null or p_grant_end_date is not null or nullif(trim(p_reason), '') is null then
      raise exception using errcode = '22023', message = '永久豁免必须填写原因';
    end if;
  elsif p_grant_start_date is null or p_grant_end_date is null or p_grant_start_date > p_grant_end_date then
    raise exception using errcode = '22023', message = '豁免日期不正确';
  end if;

  select exists (
    select 1 from public.exemption_grant
    where user_id = p_user_id and grant_type = 'permanent' and status = 'active'
  ) into v_has_permanent;

  if p_grant_type = 'permanent' then
    update public.exemption_grant set status = 'inactive'
    where user_id = p_user_id and grant_type = 'permanent' and status = 'active';
  elsif p_replace_existing then
    update public.exemption_grant set status = 'inactive'
    where user_id = p_user_id and status = 'active' and grant_type <> 'permanent';
  end if;

  insert into public.exemption_grant (
    request_id, user_id, team_id, start_date, end_date, grant_type, exemption_category, status
  ) values (
    null, p_user_id, v_target.team_id, p_grant_start_date, p_grant_end_date,
    p_grant_type, p_exemption_category, 'active'
  ) returning id into v_grant_id;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = case when p_grant_type = 'permanent' or v_has_permanent then 'exempt' else 'active' end,
    exempt_type = case when p_grant_type = 'permanent' or v_has_permanent then 'permanent' else 'temporary' end,
    exempt_start_date = case when p_grant_type = 'permanent' or v_has_permanent then null else p_grant_start_date end,
    exempt_end_date = case when p_grant_type = 'permanent' or v_has_permanent then null else p_grant_end_date end,
    exempt_reason = case when p_grant_type = 'permanent' then nullif(trim(p_reason), '') else exempt_reason end,
    exemption_category = case when p_grant_type = 'permanent' or v_has_permanent then 'waive' else p_exemption_category end
  where id = p_user_id;

  return jsonb_build_object('grant_id', v_grant_id, 'user_id', p_user_id);
end;
$$;

create or replace function public.clear_exemption_grant_atomically_v2(
  p_user_id uuid,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target public.profiles%rowtype;
  v_has_permanent boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;
  perform 1 from public.profiles where id in (auth.uid(), p_user_id) order by id for update;
  select * into v_target from public.profiles where id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = '用户资料不存在'; end if;
  select exists (select 1 from public.exemption_grant where user_id = p_user_id and grant_type = 'permanent' and status = 'active') into v_has_permanent;
  if v_has_permanent and public.company_role_for_user(auth.uid()) <> 'company_owner' then
    raise exception using errcode = '42501', message = '仅公司所有者可撤销不参与考核';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived'
    or not public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash)
    or not (public.is_group_mode_active(p_group_mode_token_hash) or public.has_permission('manage_fulfillment') or public.has_permission('review_violations')) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  update public.exemption_grant set status = 'inactive' where user_id = p_user_id and status = 'active' and grant_type <> 'permanent';
  update public.exemption_grant set status = 'inactive' where user_id = p_user_id and grant_type = 'permanent' and status = 'active';
  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles set status = 'active', exempt_type = null, exempt_start_date = null, exempt_end_date = null, exempt_reason = null, exemption_category = null where id = p_user_id;
  return jsonb_build_object('user_id', p_user_id, 'cleared', true);
end;
$$;

grant execute on function public.apply_exemption_grant_atomically_v2(uuid, date, date, text, text, text, boolean, text) to authenticated;
grant execute on function public.clear_exemption_grant_atomically_v2(uuid, text) to authenticated;
