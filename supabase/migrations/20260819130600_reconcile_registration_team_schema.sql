-- The registration seed row exists; only the missing schema field is needed.

alter table public.teams
  add column if not exists is_demo boolean default false;
