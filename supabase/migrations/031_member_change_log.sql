create table if not exists public.member_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  team_id uuid references public.teams(id),
  action_type text not null
    check (action_type in ('add','remove','transfer','disable')),
  operator_id uuid references auth.users(id),
  action_reason text,
  effective_at timestamptz default now()
);

alter table public.member_change_log enable row level security;
