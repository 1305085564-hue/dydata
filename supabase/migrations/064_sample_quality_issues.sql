create table if not exists public.sample_quality_issues (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  severity text not null check (severity in ('critical', 'warning')),
  issues_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  resolved_at timestamptz
);

create index if not exists idx_sample_quality_issues_report_id
  on public.sample_quality_issues(report_id);

create index if not exists idx_sample_quality_issues_created_at
  on public.sample_quality_issues(created_at desc);

create index if not exists idx_sample_quality_issues_unresolved
  on public.sample_quality_issues(created_at desc)
  where resolved_at is null;

grant select, insert, update on public.sample_quality_issues to authenticated;
grant select, insert, update on public.sample_quality_issues to service_role;

alter table public.sample_quality_issues enable row level security;

drop policy if exists "sample_quality_issues_select_policy" on public.sample_quality_issues;
drop policy if exists "sample_quality_issues_insert_policy" on public.sample_quality_issues;
drop policy if exists "sample_quality_issues_update_policy" on public.sample_quality_issues;

create policy "sample_quality_issues_select_policy"
  on public.sample_quality_issues
  for select
  using (public.is_admin());

create policy "sample_quality_issues_insert_policy"
  on public.sample_quality_issues
  for insert
  with check (public.is_admin());

create policy "sample_quality_issues_update_policy"
  on public.sample_quality_issues
  for update
  using (public.is_admin())
  with check (public.is_admin());
