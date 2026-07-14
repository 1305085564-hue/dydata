create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null,
  event_type text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint usage_events_path_check check (left(path, 1) = '/'),
  constraint usage_events_event_type_check check (
    event_type in (
      'page_view',
      'submit_daily_report',
      'apply_exemption',
      'submit_work_submission',
      'submit_review_draft',
      'submit_violation_case',
      'review_violation_case',
      'rewrite_generate',
      'mark_fulfillment_status'
    )
  )
);

create index if not exists usage_events_created_at_idx
  on public.usage_events (created_at desc);

create index if not exists usage_events_path_created_at_idx
  on public.usage_events (path, created_at desc);

create index if not exists usage_events_event_type_created_at_idx
  on public.usage_events (event_type, created_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events_insert_own"
  on public.usage_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "usage_events_select_own"
  on public.usage_events
  for select
  to authenticated
  using (auth.uid() = user_id);
