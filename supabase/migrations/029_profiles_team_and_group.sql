alter table public.profiles
  add column if not exists team_id uuid references public.teams(id),
  add column if not exists group_id uuid references public.groups(id);

create index if not exists idx_profiles_team_id on public.profiles(team_id);
create index if not exists idx_profiles_group_id on public.profiles(group_id);
