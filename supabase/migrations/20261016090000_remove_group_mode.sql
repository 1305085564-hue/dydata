-- Remove the retired cross-company group mode surface.
-- This migration is the forward cleanup point; historical migrations remain immutable.

drop function if exists public.is_group_mode_active(text);
drop function if exists public.has_group_owner_qualification(uuid);
drop function if exists public.get_role_permissions(text, boolean);
drop function if exists public.visible_user_ids_v2(uuid, text);
drop function if exists public.active_visible_user_ids_v2(uuid, text);
drop function if exists public.exemption_target_in_active_scope(uuid, uuid, text);
drop function if exists public.admin_cockpit_summary_v2(date, text);
drop function if exists public.admin_pending_submissions_today_v2(date, text);
drop function if exists public.apply_exemption_grant_atomically_v2(uuid, date, date, text, text, text, boolean, text);
drop function if exists public.clear_exemption_grant_atomically_v2(uuid, text);
drop function if exists public.review_exemption_request_atomically_v2(uuid, text, text);
drop function if exists public.review_exemption_request_dates_atomically(uuid, text, date[], text, text);
drop function if exists public.re_review_exemption_request_atomically(uuid, text, text);
drop function if exists public.reopen_exemption_request_atomically(uuid, text);
drop function if exists public.set_permanent_exemption_owner_atomically(uuid, text, text);
drop function if exists public.clear_permanent_exemption_owner_atomically(uuid, text);
drop table if exists public.group_permission_qualifications cascade;
drop table if exists public.group_mode_sessions cascade;

-- Legacy data_scope=all was the retired cross-company marker. Normalize it before
-- tightening the column constraint so old rows cannot recreate that scope.
update public.profiles set data_scope = 'team' where data_scope = 'all';
alter table public.profiles drop constraint if exists profiles_data_scope_check;
alter table public.profiles add constraint profiles_data_scope_check check (data_scope in ('self', 'team'));

create or replace function public.get_role_permissions(p_role text)
returns text[]
language plpgsql immutable security invoker set search_path = ''
as $$
begin
  p_role := case when p_role = 'owner' then 'company_owner' else p_role end;
  case p_role
    when 'member' then return array['view_analytics', 'export_data', 'view_video_review'];
    when 'admin' then return array['view_analytics', 'export_data', 'view_conversion', 'review_content', 'view_video_review', 'manage_fulfillment', 'manage_videos', 'manage_members', 'review_violations', 'use_ai_copy'];
    when 'company_owner' then return array['view_analytics', 'export_data', 'view_conversion', 'review_content', 'view_video_review', 'manage_fulfillment', 'manage_videos', 'manage_members', 'review_violations', 'manage_system', 'use_ai_copy', 'use_ai_assist'];
    else return array[]::text[];
  end case;
end;
$$;

create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select perm = any(public.get_role_permissions(public.company_role_for_user(p.id))) from public.profiles p where p.id = auth.uid() and p.membership_status = 'active'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.membership_status = 'active'
      and coalesce(
        p.company_role,
        case when p.role = 'owner' then 'company_owner' else p.role end
      ) in ('admin', 'company_owner')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.membership_status = 'active'
      and coalesce(
        p.company_role,
        case when p.role = 'owner' then 'company_owner' else p.role end
      ) = 'company_owner'
  );
$$;

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role' = 'service_role', false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
        and coalesce(
          p.company_role,
          case when p.role = 'owner' then 'company_owner' else p.role end
        ) in ('admin', 'company_owner')
    );
$$;

create or replace function public.visible_user_ids_v2(p_actor_id uuid default auth.uid())
returns table(user_id uuid) language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_actor public.profiles%rowtype; v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then raise exception using errcode = '42501', message = 'permission denied'; end if;
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then return; end if;
  v_role := public.company_role_for_user(p_actor_id);
  if v_role in ('admin', 'company_owner') and v_actor.team_id is not null then
    return query select p.id from public.profiles p where p.team_id = v_actor.team_id or (coalesce(p.membership_status, 'active') = 'archived' and p.archive_snapshot ->> 'team_id' = v_actor.team_id::text);
    return;
  end if;
  return query select v_actor.id;
end;
$$;

create or replace function public.active_visible_user_ids_v2(p_actor_id uuid default auth.uid())
returns table(user_id uuid) language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_actor public.profiles%rowtype; v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then raise exception using errcode = '42501', message = 'permission denied'; end if;
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then return; end if;
  v_role := public.company_role_for_user(p_actor_id);
  if v_role in ('admin', 'company_owner') and v_actor.team_id is not null then
    return query select p.id from public.profiles p where p.team_id = v_actor.team_id and coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;
  return query select v_actor.id;
end;
$$;

create or replace function public.visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid) language sql stable security definer set search_path = pg_catalog, public
as $$ select user_id from public.visible_user_ids_v2(p_actor_id); $$;

create or replace function public.active_visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid) language sql stable security definer set search_path = pg_catalog, public
as $$ select user_id from public.active_visible_user_ids_v2(p_actor_id); $$;

create or replace function public.exemption_target_in_active_scope(p_actor_id uuid, p_target_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select exists (select 1 from public.active_visible_user_ids_v2(p_actor_id) visible where visible.user_id = p_target_id); $$;

create or replace function public.admin_cockpit_summary_v2(
  target_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  pending_videos_count int;
  pending_violations_count int;
  pending_submissions_count int;
  pending_exemptions_count int;
begin
  if not (
    public.has_permission('view_analytics')
    or public.has_permission('manage_fulfillment')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select count(*)::int into pending_videos_count
  from public.videos v
  where v.created_at::date = target_date
    and public.exemption_target_in_active_scope(auth.uid(), v.user_id)
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
    and public.exemption_target_in_active_scope(auth.uid(), vc.submitted_by)
    and not exists (
      select 1 from public.profiles p
      where p.id = vc.submitted_by and coalesce(p.membership_status, 'active') = 'archived'
    );

  select count(*)::int into pending_submissions_count
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
    and public.exemption_target_in_active_scope(auth.uid(), p.id)
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
    and public.exemption_target_in_active_scope(auth.uid(), er.applicant_user_id)
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

create or replace function public.admin_pending_submissions_today_v2(
  target_date date default current_date
)
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
set search_path = pg_catalog, public
as $$
begin
  if not (
    public.has_permission('view_analytics')
    or public.has_permission('manage_fulfillment')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
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
    and public.exemption_target_in_active_scope(auth.uid(), p.id)
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

create or replace function public.admin_cockpit_summary(target_date date default current_date)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$ select public.admin_cockpit_summary_v2(target_date); $$;

create or replace function public.admin_pending_submissions_today(target_date date default current_date)
returns table(profile_id uuid, name text, team_id uuid, team_name text, last_report_date date)
language sql stable security definer set search_path = pg_catalog, public
as $$ select * from public.admin_pending_submissions_today_v2(target_date); $$;

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

create or replace function public.review_exemption_request_dates_atomically(
  p_request_id uuid,
  p_decision text,
  p_dates date[] default null,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_dates date[];
  v_pending int;
  v_approved int;
  v_rejected int;
  v_grant_count int := 0;
  v_remaining_grant public.exemption_grant%rowtype;
  v_remaining_reason text;
  v_remaining_category text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = '无权限审批豁免'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = '审核决定不正确'; end if;
  if not (public.has_permission('manage_fulfillment') or public.has_permission('review_violations')) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_request from public.exemption_request where id = p_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = '申请不存在'; end if;
  if v_request.applicant_user_id = auth.uid() or not public.exemption_target_in_active_scope(auth.uid(), v_request.applicant_user_id) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  select * into v_target from public.profiles where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then raise exception using errcode = 'P0002', message = '用户资料不存在'; end if;

  -- 与旧 review RPC 对齐的批准前置校验：拒绝不需要（历史拒绝单也允许改判日期）。
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
      update public.exemption_grant set status = 'inactive'
      where user_id = v_target.id and status = 'active';
    end if;
  end if;

  insert into public.exemption_request_date (request_id, request_date, reason, status)
  select v_request.id, gs::date, v_request.reason, coalesce(v_request.request_status, 'pending')
  from generate_series(v_request.start_date, coalesce(v_request.end_date, v_request.start_date), interval '1 day') gs
  on conflict (request_id, request_date) do nothing;

  if p_dates is null or cardinality(p_dates) = 0 then
    select array_agg(request_date order by request_date) into v_dates
    from public.exemption_request_date where request_id = p_request_id and status = 'pending';
  else
    v_dates := (select array_agg(distinct d order by d) from unnest(p_dates) d);
    if exists (select 1 from unnest(v_dates) d where not exists (select 1 from public.exemption_request_date where request_id = p_request_id and request_date = d)) then
      raise exception using errcode = '22023', message = '审批日期不属于该申请';
    end if;
  end if;
  if v_dates is null or cardinality(v_dates) = 0 then raise exception using errcode = 'P0001', message = '该申请已处理'; end if;

  update public.exemption_request_date
  set status = p_decision, feedback = nullif(trim(p_feedback), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where request_id = p_request_id and request_date = any(v_dates) and status = 'pending';
  if not found then raise exception using errcode = 'P0001', message = '该申请已处理'; end if;

  if p_decision = 'approved' then
    insert into public.exemption_grant (request_id, user_id, team_id, start_date, end_date, grant_type, exemption_category, status)
    select p_request_id, v_target.id, v_target.team_id, d.request_date,
      case when v_request.exemption_type = 'permanent' then null else d.request_date end,
      v_request.exemption_type, coalesce(v_request.exemption_category, 'waive'), 'active'
    from public.exemption_request_date d
    where d.request_id = p_request_id and d.request_date = any(v_dates) and d.status = 'approved'
    on conflict do nothing;
    get diagnostics v_grant_count = row_count;
  end if;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected')
    into v_pending, v_approved, v_rejected from public.exemption_request_date where request_id = p_request_id;
  update public.exemption_request set
    request_status = case when v_pending > 0 then 'pending' when v_rejected > 0 then 'rejected' else 'approved' end,
    reviewed_by = case when v_pending = 0 then auth.uid() else reviewed_by end,
    reviewed_at = case when v_pending = 0 then now() else reviewed_at end
  where id = p_request_id;

  -- 无剩余 pending 日期时，按剩余 active grant 重算 profiles 豁免投影（永久优先，否则最新 active），
  -- 与改判 RPC 同一套口径；全部批准时本次新插入的 grant 即参与重算。
  if v_pending = 0 then
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
  end if;

  return jsonb_build_object('request_id', p_request_id, 'decision', p_decision, 'dates', v_dates, 'feedback', nullif(trim(p_feedback), ''), 'pending_count', v_pending, 'approved_count', v_approved, 'rejected_count', v_rejected, 'grant_count', v_grant_count);
end;
$$;

create or replace function public.reopen_exemption_request_atomically(
  p_request_id uuid
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
    or not public.exemption_target_in_active_scope(auth.uid(), v_request.applicant_user_id) then
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

create or replace function public.set_permanent_exemption_owner_atomically(
  p_user_id uuid,
  p_reason text
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
  if not public.exemption_target_in_active_scope(auth.uid(), p_user_id) then
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
  p_user_id uuid
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
  if not public.exemption_target_in_active_scope(auth.uid(), p_user_id) then
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

revoke all on function public.get_role_permissions(text) from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.visible_user_ids_v2(uuid) from public, anon;
revoke all on function public.active_visible_user_ids_v2(uuid) from public, anon;
revoke all on function public.visible_user_ids(uuid) from public, anon;
revoke all on function public.active_visible_user_ids(uuid) from public, anon;
revoke all on function public.exemption_target_in_active_scope(uuid, uuid) from public, anon, service_role;
revoke all on function public.admin_cockpit_summary_v2(date) from public, anon;
revoke all on function public.admin_pending_submissions_today_v2(date) from public, anon;
revoke all on function public.admin_cockpit_summary(date) from public, anon;
revoke all on function public.admin_pending_submissions_today(date) from public, anon;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) from public, anon, service_role;
revoke all on function public.clear_exemption_grant_atomically(uuid) from public, anon, service_role;
revoke all on function public.review_exemption_request_atomically(uuid, text) from public, anon, service_role;
revoke all on function public.review_exemption_request_dates_atomically(uuid, text, date[], text) from public, anon, service_role;
revoke all on function public.reopen_exemption_request_atomically(uuid) from public, anon, service_role;
revoke all on function public.set_permanent_exemption_owner_atomically(uuid, text) from public, anon, service_role;
revoke all on function public.clear_permanent_exemption_owner_atomically(uuid) from public, anon, service_role;

grant execute on function public.get_role_permissions(text) to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.visible_user_ids_v2(uuid) to authenticated, service_role;
grant execute on function public.active_visible_user_ids_v2(uuid) to authenticated, service_role;
grant execute on function public.visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.active_visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.exemption_target_in_active_scope(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_cockpit_summary_v2(date) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today_v2(date) to authenticated, service_role;
grant execute on function public.admin_cockpit_summary(date) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today(date) to authenticated, service_role;
grant execute on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.clear_exemption_grant_atomically(uuid) to authenticated, service_role;
grant execute on function public.review_exemption_request_atomically(uuid, text) to authenticated, service_role;
grant execute on function public.review_exemption_request_dates_atomically(uuid, text, date[], text) to authenticated;
grant execute on function public.reopen_exemption_request_atomically(uuid) to authenticated;
grant execute on function public.set_permanent_exemption_owner_atomically(uuid, text) to authenticated;
grant execute on function public.clear_permanent_exemption_owner_atomically(uuid) to authenticated;
