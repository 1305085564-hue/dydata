create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  name text not null,
  is_demo boolean default false,
  created_at timestamptz default now()
);

alter table public.teams enable row level security;

insert into public.teams (name, is_demo)
select '演示团队', true
where not exists (
  select 1 from public.teams where name = '演示团队' and is_demo = true
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id),
  org_id uuid,
  name text not null,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;
