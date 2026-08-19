-- Restore the missing knowledge_cases base table from 20260628113000.
-- This migration intentionally does not create the dependent case-library tables.

create table if not exists public.knowledge_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  account_name_snapshot text,
  original_video_id uuid references public.videos(id) on delete set null,
  legacy_source_violation_case_id uuid unique references public.violation_cases(id) on delete set null,
  source_script_text text not null default '',
  source_notes text,
  screenshot_paths text[] not null default '{}',
  status text not null default 'submitted'
    check (status in ('submitted', 'needs_revision', 'verified', 'deprecated')),
  hook_text text,
  body_text text,
  cta_text text,
  admin_insight text,
  usage_count int not null default 0 check (usage_count >= 0),
  actual_completion_rate numeric(10,8),
  actual_conversion_rate numeric(10,8),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  revision_requested_by uuid references public.profiles(id) on delete set null,
  revision_requested_at timestamptz,
  revision_note text,
  revision_missing_fields jsonb not null default '[]'::jsonb,
  deprecated_reason text,
  source_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_knowledge_cases_status_created
  on public.knowledge_cases(status, created_at desc);

create index if not exists idx_knowledge_cases_submitted_by
  on public.knowledge_cases(submitted_by, created_at desc);

create index if not exists idx_knowledge_cases_team_status
  on public.knowledge_cases(team_id, status, created_at desc);

create index if not exists idx_knowledge_cases_verified_rank
  on public.knowledge_cases(actual_conversion_rate desc, usage_count desc, created_at desc)
  where status = 'verified';

grant select, insert, update, delete on public.knowledge_cases to authenticated;
grant select, insert, update, delete on public.knowledge_cases to service_role;

alter table public.knowledge_cases enable row level security;

drop policy if exists "knowledge_cases_select" on public.knowledge_cases;
create policy "knowledge_cases_select"
  on public.knowledge_cases
  for select
  using (
    auth.role() = 'authenticated'
    and (
      submitted_by = auth.uid()
      or public.has_violation_permission()
      or public.is_admin()
    )
  );

drop policy if exists "knowledge_cases_insert" on public.knowledge_cases;
create policy "knowledge_cases_insert"
  on public.knowledge_cases
  for insert
  with check (
    auth.role() = 'authenticated'
    and submitted_by = auth.uid()
    and (account_id is null or public.owns_account(account_id))
  );

drop policy if exists "knowledge_cases_update" on public.knowledge_cases;
create policy "knowledge_cases_update"
  on public.knowledge_cases
  for update
  using (
    auth.role() = 'authenticated'
    and (public.has_violation_permission() or public.is_admin())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.has_violation_permission() or public.is_admin())
  );

drop policy if exists "knowledge_cases_delete" on public.knowledge_cases;
create policy "knowledge_cases_delete"
  on public.knowledge_cases
  for delete
  using (
    auth.role() = 'authenticated'
    and (public.has_violation_permission() or public.is_admin())
  );
