-- 049: SOP team management V1-P0 data foundation

alter table public.groups
  add column if not exists leader_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_groups_leader_user_id on public.groups(leader_user_id);

create table if not exists public.sop_daily_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  status_date date not null,
  data_report_status text not null default 'IDLE' check (data_report_status in ('IDLE', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE')),
  morning_review_status text not null default 'IDLE' check (morning_review_status in ('IDLE', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE')),
  topic_status text not null default 'IDLE' check (topic_status in ('IDLE', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE')),
  script_status text not null default 'IDLE' check (script_status in ('IDLE', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE')),
  video_status text not null default 'IDLE' check (video_status in ('IDLE', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE')),
  current_blocker text check (current_blocker in ('DATA_REPORT', 'MORNING_REVIEW', 'TOPIC', 'SCRIPT', 'VIDEO')),
  is_overdue boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, status_date)
);

create table if not exists public.sop_checkpoint_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  status_date date not null,
  checkpoint text not null check (checkpoint in ('DATA_REPORT', 'MORNING_REVIEW', 'TOPIC', 'SCRIPT', 'VIDEO')),
  topic_text text,
  script_text text,
  video_url text,
  notes text,
  review_status text not null default 'SUBMITTED' check (review_status in ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  submitted_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, status_date, checkpoint)
);

-- 历史遗留表，未接入业务代码（2026-07-01 确认）。
-- 早期设计用于 6 维度审核评分，但批改台已改用 content_feedback_cards 的「主要问题 + 改进反馈」模型。
-- 该表目前没有前后端调用，保留仅作历史记录；如后续产品方向确认不再使用，可通过新增 migration 删除。
create table if not exists public.sop_review_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.sop_checkpoint_submissions(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  hook_score integer not null check (hook_score between 0 and 10),
  viewpoint_score integer not null check (viewpoint_score between 0 and 10),
  compliance_score integer not null check (compliance_score between 0 and 10),
  performance_hook_score integer not null check (performance_hook_score between 0 and 10),
  yesterday_review_score integer not null check (yesterday_review_score between 0 and 10),
  cta_score integer not null check (cta_score between 0 and 10),
  total_score numeric(4,2) not null check (total_score between 0 and 10),
  is_passed boolean not null,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists sop_review_scores_submission_latest_key
  on public.sop_review_scores(submission_id, created_at desc);

create index if not exists idx_sop_daily_status_date_group on public.sop_daily_status(status_date, group_id);
create index if not exists idx_sop_daily_status_date_team on public.sop_daily_status(status_date, team_id);
create index if not exists idx_sop_checkpoint_user_date on public.sop_checkpoint_submissions(user_id, status_date);
create index if not exists idx_sop_checkpoint_date_group on public.sop_checkpoint_submissions(status_date, group_id);
create index if not exists idx_sop_review_scores_submission on public.sop_review_scores(submission_id);

alter table public.sop_daily_status enable row level security;
alter table public.sop_checkpoint_submissions enable row level security;
alter table public.sop_review_scores enable row level security;

drop policy if exists "sop_daily_status_service_role_bypass" on public.sop_daily_status;
create policy "sop_daily_status_service_role_bypass"
  on public.sop_daily_status
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "sop_checkpoint_submissions_service_role_bypass" on public.sop_checkpoint_submissions;
create policy "sop_checkpoint_submissions_service_role_bypass"
  on public.sop_checkpoint_submissions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "sop_review_scores_service_role_bypass" on public.sop_review_scores;
create policy "sop_review_scores_service_role_bypass"
  on public.sop_review_scores
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.sop_daily_status to service_role;
grant select, insert, update, delete on public.sop_checkpoint_submissions to service_role;
grant select, insert, update, delete on public.sop_review_scores to service_role;
grant select, update on public.groups to service_role;
