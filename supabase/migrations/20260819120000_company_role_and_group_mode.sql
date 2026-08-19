-- Company role and temporary group mode.
-- The legacy profiles.role column remains during migration. New authorization
-- decisions use company_role; legacy role is only a compatibility projection.

alter table public.profiles
  add column if not exists company_role text;

update public.profiles
set company_role = case
  when role = 'owner' then 'company_owner'
  when role = 'admin' then 'admin'
  else 'member'
end
where company_role is null;

alter table public.profiles
  alter column company_role set default 'member',
  alter column company_role set not null;

alter table public.profiles
  drop constraint if exists profiles_company_role_check;

alter table public.profiles
  add constraint profiles_company_role_check
  check (company_role in ('member', 'admin', 'company_owner'));

create index if not exists idx_profiles_company_role_team
  on public.profiles (company_role, team_id);

create table if not exists public.group_permission_qualifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default timezone('utc'::text, now()),
  granted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz
);

comment on table public.group_permission_qualifications is
  'Explicit qualification to enter temporary group mode. No row means no qualification.';

create table if not exists public.group_mode_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_group_mode_sessions_user_active
  on public.group_mode_sessions (user_id, expires_at)
  where revoked_at is null;

alter table public.group_permission_qualifications enable row level security;
alter table public.group_mode_sessions enable row level security;

drop policy if exists "group qualification self read" on public.group_permission_qualifications;
create policy "group qualification self read"
  on public.group_permission_qualifications
  for select
  using (user_id = auth.uid());

-- Qualification changes are service-role-only. Table privileges are revoked
-- because permissive RLS policies combine with OR and cannot be deny rules.
drop policy if exists "group qualification authenticated insert denied" on public.group_permission_qualifications;
drop policy if exists "group qualification authenticated update denied" on public.group_permission_qualifications;
drop policy if exists "group qualification authenticated delete denied" on public.group_permission_qualifications;
revoke all on table public.group_permission_qualifications from anon;
grant select on table public.group_permission_qualifications to authenticated;
revoke insert, update, delete on table public.group_permission_qualifications from anon, authenticated;

drop policy if exists "group mode session self read" on public.group_mode_sessions;
create policy "group mode session self read"
  on public.group_mode_sessions
  for select
  using (user_id = auth.uid());

-- Sessions are issued and revoked by the server-side service role only.
drop policy if exists "group mode session authenticated insert denied" on public.group_mode_sessions;
drop policy if exists "group mode session authenticated update denied" on public.group_mode_sessions;
drop policy if exists "group mode session authenticated delete denied" on public.group_mode_sessions;
revoke all on table public.group_mode_sessions from anon;
grant select on table public.group_mode_sessions to authenticated;
revoke insert, update, delete on table public.group_mode_sessions from anon, authenticated;

create or replace function public.company_role_for_user(p_user_id uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select coalesce(company_role, case when role = 'owner' then 'company_owner' else role end)
  into v_role
  from public.profiles
  where id = p_user_id;

  return case when v_role in ('member', 'admin', 'company_owner') then v_role else null end;
end;
$$;

create or replace function public.has_group_owner_qualification(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  return exists (
    select 1
    from public.group_permission_qualifications q
    join public.profiles p on p.id = q.user_id
    where q.user_id = p_user_id
      and q.revoked_at is null
      and coalesce(p.membership_status, 'active') <> 'archived'
  );
end;
$$;

create or replace function public.is_group_mode_active(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and p_token_hash is not null
    and exists (
      select 1
      from public.group_mode_sessions s
      where s.user_id = auth.uid()
        and s.token_hash = p_token_hash
        and s.revoked_at is null
        and s.expires_at > timezone('utc'::text, now())
        and public.has_group_owner_qualification(s.user_id)
    );
$$;

-- Fixed permission keys. The legacy JSON column is not used for new roles.
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.membership_status, 'active') <> 'archived'
      and (
        (coalesce(p.company_role, case when p.role = 'owner' then 'company_owner' else p.role end) in ('admin', 'company_owner')
          and perm in (
            'view_analytics', 'view_conversion', 'review_content',
            'manage_fulfillment', 'manage_videos', 'review_violations', 'use_ai_copy'
          ))
        or (coalesce(p.company_role, case when p.role = 'owner' then 'company_owner' else p.role end) = 'company_owner'
          and perm in ('export_data', 'manage_members', 'manage_system', 'use_ai_assist'))
      )
  );
$$;

create or replace function public.visible_user_ids_v2(
  p_actor_id uuid default auth.uid(),
  p_group_mode_token_hash text default null
)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_role := public.company_role_for_user(p_actor_id);
  if p_group_mode_token_hash is not null and public.is_group_mode_active(p_group_mode_token_hash) then
    return query select p.id from public.profiles p;
    return;
  end if;

  if v_role in ('admin', 'company_owner') and v_actor.team_id is not null then
    return query
    select p.id
    from public.profiles p
    where p.team_id = v_actor.team_id
       or (
         coalesce(p.membership_status, 'active') = 'archived'
         and p.archive_snapshot ->> 'team_id' = v_actor.team_id::text
       );
    return;
  end if;

  return query select v_actor.id;
end;
$$;

create or replace function public.active_visible_user_ids_v2(
  p_actor_id uuid default auth.uid(),
  p_group_mode_token_hash text default null
)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_role := public.company_role_for_user(p_actor_id);
  if p_group_mode_token_hash is not null and public.is_group_mode_active(p_group_mode_token_hash) then
    return query
    select p.id from public.profiles p
    where coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  if v_role in ('admin', 'company_owner') and v_actor.team_id is not null then
    return query
    select p.id from public.profiles p
    where p.team_id = v_actor.team_id
      and coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  return query select v_actor.id;
end;
$$;

-- Keep the existing helper names, but remove the old owner=all behavior.
create or replace function public.visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select user_id from public.visible_user_ids_v2(p_actor_id, null);
$$;

create or replace function public.active_visible_user_ids(p_actor_id uuid default auth.uid())
returns table(user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select user_id from public.active_visible_user_ids_v2(p_actor_id, null);
$$;

create or replace function public.get_data_scope()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when coalesce(company_role, case when role = 'owner' then 'company_owner' else role end) in ('admin', 'company_owner')
      then 'team'
    else 'self'
  end
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.exemption_target_in_active_scope(
  p_actor_id uuid,
  p_target_id uuid,
  p_group_mode_token_hash text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.active_visible_user_ids_v2(p_actor_id, p_group_mode_token_hash) visible
    where visible.user_id = p_target_id
  );
$$;

create or replace function public.admin_cockpit_summary_v2(
  target_date date default current_date,
  p_group_mode_token_hash text default null
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
    public.is_group_mode_active(p_group_mode_token_hash)
    or public.has_permission('view_analytics')
    or public.has_permission('manage_fulfillment')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select count(*)::int into pending_videos_count
  from public.videos v
  where v.created_at::date = target_date
    and public.exemption_target_in_active_scope(auth.uid(), v.user_id, p_group_mode_token_hash)
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
    and public.exemption_target_in_active_scope(auth.uid(), vc.submitted_by, p_group_mode_token_hash)
    and not exists (
      select 1 from public.profiles p
      where p.id = vc.submitted_by and coalesce(p.membership_status, 'active') = 'archived'
    );

  select count(*)::int into pending_submissions_count
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
    and public.exemption_target_in_active_scope(auth.uid(), p.id, p_group_mode_token_hash)
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
    and public.exemption_target_in_active_scope(auth.uid(), er.applicant_user_id, p_group_mode_token_hash)
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
  target_date date default current_date,
  p_group_mode_token_hash text default null
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
    public.is_group_mode_active(p_group_mode_token_hash)
    or public.has_permission('view_analytics')
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
    and public.exemption_target_in_active_scope(auth.uid(), p.id, p_group_mode_token_hash)
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
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.admin_cockpit_summary_v2(target_date, null);
$$;

create or replace function public.admin_pending_submissions_today(target_date date default current_date)
returns table (
  profile_id uuid,
  name text,
  team_id uuid,
  team_name text,
  last_report_date date
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select * from public.admin_pending_submissions_today_v2(target_date, null);
$$;

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
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_target
  from public.profiles
  where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  if not (
    (public.is_group_mode_active(p_group_mode_token_hash)
      or public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations'))
    and public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash)
  ) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  if p_grant_type is null
    or p_grant_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
    raise exception using errcode = '22023', message = '豁免类型不正确';
  end if;
  if p_exemption_category is null or p_exemption_category not in ('waive', 'leave') then
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
    where user_id = p_user_id and status = 'active';
  end if;

  insert into public.exemption_grant (
    request_id, user_id, team_id, start_date, end_date, grant_type,
    exemption_category, status
  ) values (
    null, p_user_id, v_target.team_id, p_grant_start_date, p_grant_end_date,
    p_grant_type, p_exemption_category, 'active'
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
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  if not (
    (public.is_group_mode_active(p_group_mode_token_hash)
      or public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations'))
    and public.exemption_target_in_active_scope(auth.uid(), p_user_id, p_group_mode_token_hash)
  ) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;

  update public.exemption_grant
  set status = 'inactive'
  where user_id = p_user_id and status = 'active';

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

create or replace function public.review_exemption_request_atomically_v2(
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
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_grant_id uuid;
begin
  if auth.uid() is null then
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
    if v_request.exemption_category is null or v_request.exemption_category not in ('waive', 'leave') then
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
    elsif v_request.start_date is null
      or v_request.end_date is null
      or v_request.start_date > v_request.end_date then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;

    insert into public.exemption_grant (
      request_id, user_id, team_id, start_date, end_date, grant_type,
      exemption_category, status
    ) values (
      v_request.id, v_target.id, v_target.team_id, v_request.start_date,
      v_request.end_date, v_request.exemption_type, v_request.exemption_category, 'active'
    ) returning id into v_grant_id;

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
  set request_status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'grant_id', v_grant_id
  );
end;
$$;

-- Existing callers remain compatible, but now use the company-scoped guard.
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
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.apply_exemption_grant_atomically_v2(
    p_user_id, p_grant_start_date, p_grant_end_date, p_grant_type,
    p_exemption_category, p_reason, p_replace_existing, null
  );
$$;

create or replace function public.clear_exemption_grant_atomically(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.clear_exemption_grant_atomically_v2(p_user_id, null);
$$;

create or replace function public.review_exemption_request_atomically(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.review_exemption_request_atomically_v2(p_request_id, p_decision, null);
$$;

-- SECURITY DEFINER entry points are private to authenticated callers (and the
-- server role where explicitly needed). PUBLIC/anon execution is removed so
-- the default function privilege cannot become an authorization bypass.
revoke all on function public.company_role_for_user(uuid) from public, anon;
revoke all on function public.has_group_owner_qualification(uuid) from public, anon;
revoke all on function public.is_group_mode_active(text) from public, anon;
revoke all on function public.visible_user_ids_v2(uuid, text) from public, anon;
revoke all on function public.active_visible_user_ids_v2(uuid, text) from public, anon;
revoke all on function public.visible_user_ids(uuid) from public, anon;
revoke all on function public.active_visible_user_ids(uuid) from public, anon;
revoke all on function public.get_data_scope() from public, anon;
revoke all on function public.exemption_target_in_active_scope(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.admin_cockpit_summary_v2(date, text) from public, anon;
revoke all on function public.admin_pending_submissions_today_v2(date, text) from public, anon;
revoke all on function public.admin_cockpit_summary(date) from public, anon;
revoke all on function public.admin_pending_submissions_today(date) from public, anon;
revoke all on function public.apply_exemption_grant_atomically_v2(uuid, date, date, text, text, text, boolean, text) from public, anon, service_role;
revoke all on function public.clear_exemption_grant_atomically_v2(uuid, text) from public, anon, service_role;
revoke all on function public.review_exemption_request_atomically_v2(uuid, text, text) from public, anon, service_role;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) from public, anon, service_role;
revoke all on function public.clear_exemption_grant_atomically(uuid) from public, anon, service_role;
revoke all on function public.review_exemption_request_atomically(uuid, text) from public, anon, service_role;

grant execute on function public.company_role_for_user(uuid) to authenticated, service_role;
grant execute on function public.has_group_owner_qualification(uuid) to authenticated, service_role;
grant execute on function public.is_group_mode_active(text) to authenticated, service_role;
grant execute on function public.visible_user_ids_v2(uuid, text) to authenticated, service_role;
grant execute on function public.active_visible_user_ids_v2(uuid, text) to authenticated, service_role;
grant execute on function public.visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.active_visible_user_ids(uuid) to authenticated, service_role;
grant execute on function public.get_data_scope() to authenticated, service_role;
grant execute on function public.admin_cockpit_summary_v2(date, text) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today_v2(date, text) to authenticated, service_role;
grant execute on function public.admin_cockpit_summary(date) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today(date) to authenticated, service_role;
grant execute on function public.apply_exemption_grant_atomically_v2(uuid, date, date, text, text, text, boolean, text) to authenticated;
grant execute on function public.clear_exemption_grant_atomically_v2(uuid, text) to authenticated;
grant execute on function public.review_exemption_request_atomically_v2(uuid, text, text) to authenticated;
grant execute on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean) to authenticated;
grant execute on function public.clear_exemption_grant_atomically(uuid) to authenticated;
grant execute on function public.review_exemption_request_atomically(uuid, text) to authenticated;
