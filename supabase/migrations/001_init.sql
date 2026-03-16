create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  report_date date not null,
  title text not null,
  submitter text not null,
  play_count integer not null default 0,
  completion_rate text,
  avg_play_duration text,
  bounce_rate_2s text,
  completion_rate_5s text,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  favorites integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists daily_reports_user_id_report_date_key
  on public.daily_reports (user_id, report_date);

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.daily_reports enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "profiles_insert_self_or_admin"
  on public.profiles
  for insert
  with check (id = auth.uid() or public.is_admin());

create policy "invite_codes_admin_all"
  on public.invite_codes
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "daily_reports_select_own_or_admin"
  on public.daily_reports
  for select
  using (user_id = auth.uid() or public.is_admin());

create policy "daily_reports_insert_own_or_admin"
  on public.daily_reports
  for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "daily_reports_update_own_or_admin"
  on public.daily_reports
  for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "daily_reports_delete_own_or_admin"
  on public.daily_reports
  for delete
  using (user_id = auth.uid() or public.is_admin());
