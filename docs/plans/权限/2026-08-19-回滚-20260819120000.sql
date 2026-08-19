begin;
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'owner' or coalesce((permissions->>perm)::boolean, false) = true)
  );
$function$
;

-- Reconcile the missing owner branches and active scope foundation.

create or replace function public.get_data_scope()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'owner' then 'all'
    else coalesce((select data_scope from public.profiles where id = auth.uid()), 'self')
  end;
$$;

create or replace function public.visible_user_ids(p_actor_id uuid default auth.uid())
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

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    return;
  end if;

  v_scope := case
    when v_actor.role = 'owner' then 'all'
    else coalesce(v_actor.data_scope, 'self')
  end;

  if v_scope = 'all' then
    return query select p.id from public.profiles p;
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query select p.id from public.profiles p where p.team_id = v_actor.team_id;
    return;
  end if;

  return query select v_actor.id;
end;
$$;

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

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_scope := case
    when v_actor.role = 'owner' then 'all'
    else coalesce(v_actor.data_scope, 'self')
  end;

  if v_scope = 'all' then
    return query
    select p.id from public.profiles p
    where coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  if v_scope = 'team' and v_actor.team_id is not null then
    return query
    select p.id from public.profiles p
    where p.team_id = v_actor.team_id
      and coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  return query select v_actor.id;
end;
$$;

grant execute on function public.get_data_scope() to authenticated, service_role;
grant execute on function public.visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.active_visible_user_ids(uuid) to authenticated, service_role;
-- Current admin queues exclude archived members; history remains readable.

create or replace function public.admin_cockpit_summary(target_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pending_videos_count int;
  pending_violations_count int;
  pending_submissions_count int;
  pending_exemptions_count int;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  select count(*)::int into pending_videos_count
  from public.videos v
  where v.created_at::date = target_date
    and not exists (
      select 1 from public.profiles p
      where p.id = v.user_id and coalesce(p.membership_status, 'active') = 'archived'
    )
    and (
      v.anomaly_status <> '正常'
      or not exists (select 1 from public.video_tags vt where vt.video_id = v.id)
    );

  select count(*)::int into pending_violations_count
  from public.violation_cases vc
  where vc.status = 'submitted'
    and vc.is_deleted = false
    and not exists (
      select 1 from public.profiles p
      where p.id = vc.submitted_by and coalesce(p.membership_status, 'active') = 'archived'
    );

  select count(*)::int into pending_submissions_count
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
    and not (
      coalesce(p.exempt_type, '') = 'permanent'
      or (
        p.exempt_type = 'temporary'
        and p.exempt_start_date is not null
        and p.exempt_end_date is not null
        and target_date between p.exempt_start_date and p.exempt_end_date
      )
      or exists (
        select 1 from public.exemption_grant eg
        where eg.user_id = p.id
          and eg.status = 'active'
          and eg.start_date is not null
          and target_date >= eg.start_date
          and (eg.end_date is null or target_date <= eg.end_date)
      )
    )
    and not exists (
      select 1 from public.daily_reports dr
      where dr.user_id = p.id and dr.report_date = target_date
    );

  select count(*)::int into pending_exemptions_count
  from public.exemption_request er
  where er.request_status = 'pending'
    and not exists (
      select 1 from public.profiles p
      where p.id = er.applicant_user_id and coalesce(p.membership_status, 'active') = 'archived'
    );

  return jsonb_build_object(
    'pending_videos', pending_videos_count,
    'pending_violations', pending_violations_count,
    'pending_submissions', pending_submissions_count,
    'pending_exemptions', pending_exemptions_count
  );
end;
$$;

create or replace function public.admin_pending_submissions_today(target_date date default current_date)
returns table (
  profile_id uuid,
  name text,
  team_id uuid,
  team_name text,
  last_report_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  return query
  select
    p.id,
    p.name,
    p.team_id,
    t.name,
    (
      select max(dr_last.report_date)
      from public.daily_reports dr_last
      where dr_last.user_id = p.id and dr_last.report_date < target_date
    )
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
    and not (
      coalesce(p.exempt_type, '') = 'permanent'
      or (
        p.exempt_type = 'temporary'
        and p.exempt_start_date is not null
        and p.exempt_end_date is not null
        and target_date between p.exempt_start_date and p.exempt_end_date
      )
      or exists (
        select 1 from public.exemption_grant eg
        where eg.user_id = p.id
          and eg.status = 'active'
          and eg.start_date is not null
          and target_date >= eg.start_date
          and (eg.end_date is null or target_date <= eg.end_date)
      )
    )
    and not exists (
      select 1 from public.daily_reports dr
      where dr.user_id = p.id and dr.report_date = target_date
    )
  order by t.name nulls last, p.name;
end;
$$;

grant execute on function public.admin_cockpit_summary(date) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today(date) to authenticated, service_role;
CREATE OR REPLACE FUNCTION public.apply_exemption_grant_atomically(p_user_id uuid, p_grant_start_date date, p_grant_end_date date, p_grant_type text, p_exemption_category text, p_reason text, p_replace_existing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if not found then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
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
    raise exception using errcode = '42501', message = '无权限管理豁免';
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
$function$
;

CREATE OR REPLACE FUNCTION public.clear_exemption_grant_atomically(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if not found then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
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
    raise exception using errcode = '42501', message = '无权限管理豁免';
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_exemption_request_atomically(p_request_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if not found then
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
  if not found then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_target
  from public.profiles
  where id = v_request.applicant_user_id;
  if not found then
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
$function$
;

drop function if exists public.review_exemption_request_atomically_v2(uuid, text, text);
drop function if exists public.clear_exemption_grant_atomically_v2(uuid, text);
drop function if exists public.apply_exemption_grant_atomically_v2(uuid, date, date, text, text, text, boolean, text);
drop function if exists public.admin_pending_submissions_today_v2(date, text);
drop function if exists public.admin_cockpit_summary_v2(date, text);
drop function if exists public.exemption_target_in_active_scope(uuid, uuid, text);
drop function if exists public.active_visible_user_ids_v2(uuid, text);
drop function if exists public.visible_user_ids_v2(uuid, text);
drop function if exists public.is_group_mode_active(text);
drop function if exists public.has_group_owner_qualification(uuid);
drop function if exists public.company_role_for_user(uuid);
drop table if exists public.group_mode_sessions;
drop table if exists public.group_permission_qualifications;
drop index if exists public.idx_profiles_company_role_team;
alter table public.profiles drop constraint if exists profiles_company_role_check;
alter table public.profiles drop column if exists company_role;
grant execute on function public.get_data_scope() to public, anon, authenticated, service_role;
grant execute on function public.visible_user_ids(uuid) to public, anon, authenticated, service_role;
grant execute on function public.active_visible_user_ids(uuid) to public, anon, authenticated, service_role;
grant execute on function public.admin_cockpit_summary(date) to public, anon, authenticated, service_role;
grant execute on function public.admin_pending_submissions_today(date) to public, anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations where version = '20260819120000';
select pg_notify('pgrst', 'reload schema');
commit;
