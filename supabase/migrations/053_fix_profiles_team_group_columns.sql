-- 053: Fix missing team/group projection columns on profiles.
-- Migration 029 was missed in production, so this file is intentionally idempotent.

alter table public.profiles
  add column if not exists team_id uuid references public.teams(id),
  add column if not exists group_id uuid references public.groups(id);

create index if not exists idx_profiles_team_id on public.profiles(team_id);
create index if not exists idx_profiles_group_id on public.profiles(group_id);

alter table public.groups
  add column if not exists leader_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_groups_leader_user_id on public.groups(leader_user_id);

update public.profiles as profile
set team_id = coalesce(
  case
    when auth_user.raw_user_meta_data->>'team_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth_user.raw_user_meta_data->>'team_id')::uuid
    else null
  end,
  team_by_name.id
)
from auth.users as auth_user
left join public.teams as team_by_name
  on team_by_name.name = auth_user.raw_user_meta_data->>'team_name'
where profile.id = auth_user.id
  and profile.team_id is null
  and (
    auth_user.raw_user_meta_data ? 'team_id'
    or auth_user.raw_user_meta_data ? 'team_name'
  );

drop policy if exists "groups_service_role_bypass" on public.groups;
create policy "groups_service_role_bypass"
  on public.groups
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "profiles_service_role_bypass" on public.profiles;
create policy "profiles_service_role_bypass"
  on public.profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.groups to service_role;
grant select, update on public.profiles to service_role;
