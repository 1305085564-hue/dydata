create table if not exists public.exemption_request (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid references auth.users(id),
  team_id uuid references public.teams(id),
  exemption_type text not null
    check (exemption_type in ('single','3days','4days','5days','permanent')),
  start_date date not null,
  end_date date,
  reason text,
  request_status text default 'pending'
    check (request_status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.exemption_request enable row level security;

create table if not exists public.exemption_grant (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.exemption_request(id),
  user_id uuid references auth.users(id),
  team_id uuid,
  start_date date,
  end_date date,
  grant_type text,
  status text default 'active',
  created_at timestamptz default now()
);

alter table public.exemption_grant enable row level security;
