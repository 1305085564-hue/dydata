-- 补建缺失的 exemption_grant 表（030 已执行但表可能被误删）
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
