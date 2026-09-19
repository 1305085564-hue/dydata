-- Permission v2 compatibility reconciliation after migration-history drift.
-- Before applying, rehearse this migration in an isolated database first.
-- Do not run `supabase db push` with this file alongside pending migrations.
-- This file replaces the six scope function definitions plus the
-- conflict-sensitive role consumers below. It does not alter profiles
-- columns, RLS policies, ACLs, or function grants.

create or replace function public.company_role_for_user(
  p_user_id uuid default auth.uid()
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_role text;
  v_legacy_role text;
  v_role text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select
    p.company_role,
    case when p.role = 'owner' then 'company_owner' else p.role end
  into v_company_role, v_legacy_role
  from public.profiles p
  where p.id = p_user_id;

  if v_company_role is not null
    and v_legacy_role is not null
    and v_company_role is distinct from v_legacy_role then
    raise exception using
      errcode = '22023',
      message = 'role/company_role conflict';
  end if;

  v_role := coalesce(v_company_role, v_legacy_role);

  return case
    when v_role in ('member', 'admin', 'company_owner') then v_role
    else null
  end;
end;
$$;

create or replace function public.has_group_owner_qualification(
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_membership_status text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select coalesce(p.membership_status, 'active')
  into v_membership_status
  from public.profiles p
  where p.id = p_user_id;

  v_role := public.company_role_for_user(p_user_id);

  return coalesce(
    v_membership_status <> 'archived'
      and v_role = 'company_owner',
    false
  );
end;
$$;

create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select perm = any(
        public.get_role_permissions(
          public.company_role_for_user(p.id),
          false
        )
      )
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
    ),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.company_role_for_user(p.id) in ('admin', 'company_owner')
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
    ),
    false
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.company_role_for_user(p.id) = 'company_owner'
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
    ),
    false
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
    or coalesce(
      (
        select public.company_role_for_user(p.id) in ('admin', 'company_owner')
        from public.profiles p
        where p.id = auth.uid()
          and p.membership_status = 'active'
      ),
      false
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

  select *
  into v_actor
  from public.profiles
  where id = p_actor_id;

  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_role := public.company_role_for_user(p_actor_id);

  if p_group_mode_token_hash is not null
    and public.is_group_mode_active(p_group_mode_token_hash) then
    return query
    select p.id
    from public.profiles p;
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

  return query
  select v_actor.id;
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

  select *
  into v_actor
  from public.profiles
  where id = p_actor_id;

  if not found or coalesce(v_actor.membership_status, 'active') = 'archived' then
    return;
  end if;

  v_role := public.company_role_for_user(p_actor_id);

  if p_group_mode_token_hash is not null
    and public.is_group_mode_active(p_group_mode_token_hash) then
    return query
    select p.id
    from public.profiles p
    where coalesce(p.membership_status, 'active') <> 'archived';
    return;
  end if;

  if v_role in ('admin', 'company_owner') and v_actor.team_id is not null then
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

create or replace function public.visible_user_ids(
  p_actor_id uuid default auth.uid()
)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select user_id
  from public.visible_user_ids_v2(p_actor_id, null);
$$;

create or replace function public.active_visible_user_ids(
  p_actor_id uuid default auth.uid()
)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select user_id
  from public.active_visible_user_ids_v2(p_actor_id, null);
$$;

create or replace function public.get_data_scope()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public.company_role_for_user(p.id) in ('admin', 'company_owner') then 'team'
    else 'self'
  end
  from public.profiles p
  where p.id = auth.uid();
$$;
