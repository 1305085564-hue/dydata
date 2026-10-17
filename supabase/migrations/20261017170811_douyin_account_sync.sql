begin;

alter table public.videos
  add column if not exists douyin_item_id text;

create unique index if not exists videos_account_douyin_item_id_key
  on public.videos (account_id, douyin_item_id)
  where douyin_item_id is not null;

alter table public.daily_reports
  drop constraint if exists daily_reports_data_source_check;

alter table public.daily_reports
  add constraint daily_reports_data_source_check
  check (data_source is null or data_source in ('ai', 'manual', 'douyin'));

create table if not exists public.douyin_oauth_states (
  state_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists douyin_oauth_states_expires_idx
  on public.douyin_oauth_states (expires_at);

create table if not exists public.douyin_account_bindings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  authorized_by uuid not null references public.profiles(id) on delete restrict,
  platform_account_id text not null unique,
  platform_union_id text,
  display_name text,
  avatar_url text,
  scopes text[] not null default '{}',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  status text not null default 'active'
    check (status in ('authorizing', 'active', 'expiring', 'expired', 'revoked', 'error')),
  last_sync_at timestamptz,
  last_error_code text,
  last_error_summary text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists douyin_account_bindings_status_idx
  on public.douyin_account_bindings (status, access_token_expires_at);

create table if not exists public.douyin_sync_runs (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.douyin_account_bindings(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('cron', 'manual', 'retry')),
  window_start date,
  window_end date,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed')),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  cursor_before integer,
  cursor_after integer,
  error_code text,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists douyin_sync_runs_one_active_per_binding
  on public.douyin_sync_runs (binding_id)
  where status in ('queued', 'running');

create index if not exists douyin_sync_runs_binding_created_idx
  on public.douyin_sync_runs (binding_id, created_at desc);

create table if not exists public.douyin_external_videos (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.douyin_account_bindings(id) on delete cascade,
  sync_run_id uuid not null references public.douyin_sync_runs(id) on delete cascade,
  platform_video_id text not null,
  title text,
  share_url text,
  platform_published_at timestamptz,
  matched_video_id uuid references public.videos(id) on delete set null,
  reconciliation_status text not null default 'discovered'
    check (reconciliation_status in ('discovered', 'matched', 'pending_review', 'reconciled', 'unavailable', 'failed', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (binding_id, platform_video_id)
);

create index if not exists douyin_external_videos_status_idx
  on public.douyin_external_videos (binding_id, reconciliation_status, platform_published_at desc);

create index if not exists douyin_external_videos_matched_video_idx
  on public.douyin_external_videos (matched_video_id)
  where matched_video_id is not null;

create table if not exists public.douyin_external_video_metrics (
  id uuid primary key default gen_random_uuid(),
  external_video_id uuid not null references public.douyin_external_videos(id) on delete cascade,
  observed_at timestamptz not null default now(),
  play_count bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  favorites bigint,
  created_at timestamptz not null default now()
);

create index if not exists douyin_external_video_metrics_video_observed_idx
  on public.douyin_external_video_metrics (external_video_id, observed_at desc);

create table if not exists public.douyin_account_metrics (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.douyin_account_bindings(id) on delete cascade,
  metric_date date not null,
  new_fans bigint,
  total_fans bigint,
  new_likes bigint,
  new_play bigint,
  profile_uv bigint,
  new_issue bigint,
  total_issue bigint,
  source text not null default 'douyin'
    check (source in ('douyin', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (binding_id, metric_date)
);

create index if not exists douyin_account_metrics_date_idx
  on public.douyin_account_metrics (binding_id, metric_date desc);

alter table public.douyin_oauth_states enable row level security;
alter table public.douyin_account_bindings enable row level security;
alter table public.douyin_sync_runs enable row level security;
alter table public.douyin_external_videos enable row level security;
alter table public.douyin_external_video_metrics enable row level security;
alter table public.douyin_account_metrics enable row level security;

revoke all on table public.douyin_oauth_states from public, anon, authenticated;
revoke all on table public.douyin_account_bindings from public, anon, authenticated;
revoke all on table public.douyin_sync_runs from public, anon, authenticated;
revoke all on table public.douyin_external_videos from public, anon, authenticated;
revoke all on table public.douyin_external_video_metrics from public, anon, authenticated;
revoke all on table public.douyin_account_metrics from public, anon, authenticated;

grant select, insert, update, delete on table public.douyin_oauth_states to service_role;
grant select, insert, update, delete on table public.douyin_account_bindings to service_role;
grant select, insert, update, delete on table public.douyin_sync_runs to service_role;
grant select, insert, update, delete on table public.douyin_external_videos to service_role;
grant select, insert, update, delete on table public.douyin_external_video_metrics to service_role;
grant select, insert, update, delete on table public.douyin_account_metrics to service_role;

create policy "Douyin service role oauth states"
  on public.douyin_oauth_states for all to service_role using (true) with check (true);
create policy "Douyin service role bindings"
  on public.douyin_account_bindings for all to service_role using (true) with check (true);
create policy "Douyin service role sync runs"
  on public.douyin_sync_runs for all to service_role using (true) with check (true);
create policy "Douyin service role external videos"
  on public.douyin_external_videos for all to service_role using (true) with check (true);
create policy "Douyin service role external metrics"
  on public.douyin_external_video_metrics for all to service_role using (true) with check (true);
create policy "Douyin service role account metrics"
  on public.douyin_account_metrics for all to service_role using (true) with check (true);

drop trigger if exists trg_douyin_account_bindings_updated_at on public.douyin_account_bindings;
create trigger trg_douyin_account_bindings_updated_at
before update on public.douyin_account_bindings
for each row execute function public.touch_updated_at();

drop trigger if exists trg_douyin_external_videos_updated_at on public.douyin_external_videos;
create trigger trg_douyin_external_videos_updated_at
before update on public.douyin_external_videos
for each row execute function public.touch_updated_at();

drop trigger if exists trg_douyin_account_metrics_updated_at on public.douyin_account_metrics;
create trigger trg_douyin_account_metrics_updated_at
before update on public.douyin_account_metrics
for each row execute function public.touch_updated_at();

comment on table public.douyin_account_bindings is 'Server-side Douyin OAuth bindings; tokens are encrypted and never exposed to clients.';
comment on table public.douyin_sync_runs is 'Idempotent Douyin sync batches and reconciliation counts.';
comment on table public.douyin_external_videos is 'Provider video staging rows; exact platform ids are required before business writes.';
comment on table public.douyin_account_metrics is 'Daily provider account metrics for the account trend view.';
comment on column public.videos.douyin_item_id is 'Stable Douyin platform item_id used for exact reconciliation; nullable for legacy/manual videos.';
comment on column public.daily_reports.data_source is 'ai: OCR/AI recognized; manual: manually entered or edited; douyin: official Douyin API sync; null: unknown historical source.';

commit;
