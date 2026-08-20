-- Company owners use group mode as a lightweight data perspective switch.
-- Keep the qualification table for migration compatibility, but do not require
-- a manually inserted qualification row for an active company owner.

alter table public.group_mode_sessions
  alter column expires_at drop not null;

comment on column public.group_mode_sessions.expires_at is
  'Optional legacy expiry. New owner sessions remain active until explicitly revoked.';

create or replace function public.has_group_owner_qualification(p_user_id uuid default auth.uid())
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

  select
    coalesce(p.company_role, case when p.role = 'owner' then 'company_owner' else p.role end),
    coalesce(p.membership_status, 'active')
  into v_role, v_membership_status
  from public.profiles p
  where p.id = p_user_id;

  return v_membership_status <> 'archived'
    and v_role = 'company_owner';
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
        and (s.expires_at is null or s.expires_at > timezone('utc'::text, now()))
        and public.has_group_owner_qualification(s.user_id)
    );
$$;

grant execute on function public.has_group_owner_qualification(uuid) to authenticated, service_role;
grant execute on function public.is_group_mode_active(text) to authenticated, service_role;
