-- AI 渠道逐次调用台账、数据库聚合统计与 90 天清理。

create table if not exists public.ai_call_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  feature_key text,
  model_id text not null,
  key_model_id uuid,
  key_id uuid,
  is_success boolean not null,
  error_kind text,
  error_message text,
  duration_ms integer not null check (duration_ms >= 0),
  is_probe boolean not null default false
);

create index if not exists idx_ai_call_attempts_key_model_created_at
  on public.ai_call_attempts (key_model_id, created_at desc);

create index if not exists idx_ai_call_attempts_feature_created_at
  on public.ai_call_attempts (feature_key, created_at desc);

create index if not exists idx_ai_call_attempts_created_at
  on public.ai_call_attempts (created_at desc);

alter table public.ai_call_attempts enable row level security;
revoke all on public.ai_call_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.ai_call_attempts to service_role;

create or replace function public.cleanup_ai_call_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_call_attempts
  where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_ai_call_attempts() from public, anon, authenticated;
grant execute on function public.cleanup_ai_call_attempts() to service_role;

create or replace function public.get_ai_call_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
with base as (
  select
    id,
    created_at,
    request_id,
    attempt_no,
    feature_key,
    model_id,
    key_model_id,
    key_id,
    is_success,
    error_kind,
    error_message,
    duration_ms,
    is_probe
  from public.ai_call_attempts
),
non_probe as (
  select * from base where is_probe = false
),
channel_ranked as (
  select
    row_number() over (partition by key_model_id order by created_at desc, id desc) as window_rank,
    *
  from non_probe
  where key_model_id is not null
),
channel_long as (
  select * from channel_ranked where window_rank <= 1000
),
channel_recent_candidates as (
  select
    row_number() over (partition by key_model_id order by created_at desc, id desc) as window_rank,
    *
  from non_probe
  where key_model_id is not null
    and created_at >= now() - interval '3 days'
),
channel_recent as (
  select * from channel_recent_candidates where window_rank <= 50
),
channel_ids as (
  select key_model_id, max(model_id) as model_id
  from non_probe
  where key_model_id is not null
  group by key_model_id
),
channel_last_failure as (
  select distinct on (key_model_id)
    key_model_id,
    created_at,
    error_kind,
    error_message,
    feature_key
  from non_probe
  where key_model_id is not null and is_success = false
  order by key_model_id, created_at desc, id desc
),
request_rows as (
  select
    feature_key,
    request_id,
    max(created_at) as request_at,
    bool_or(is_success) as is_success,
    bool_or(is_success) and bool_or(is_success = false) as rescued,
    sum(duration_ms)::integer as duration_ms
  from non_probe
  where feature_key is not null
  group by feature_key, request_id
),
feature_ranked as (
  select
    row_number() over (partition by feature_key order by request_at desc, request_id desc) as window_rank,
    *
  from request_rows
),
feature_long as (
  select * from feature_ranked where window_rank <= 1000
),
feature_recent_candidates as (
  select
    row_number() over (partition by feature_key order by request_at desc, request_id desc) as window_rank,
    *
  from request_rows
  where request_at >= now() - interval '3 days'
),
feature_recent as (
  select * from feature_recent_candidates where window_rank <= 50
),
feature_ids as (
  select feature_key from request_rows group by feature_key
),
channel_stats as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'keyModelId', c.key_model_id::text,
      'modelId', c.model_id,
      'recent1000', jsonb_build_object(
        'calls', coalesce(long_stats.calls, 0),
        'successRate', long_stats.success_rate,
        'avgMs', long_stats.avg_ms
      ),
      'recent', jsonb_build_object(
        'calls', coalesce(recent_stats.calls, 0),
        'successRate', recent_stats.success_rate,
        'avgMs', recent_stats.avg_ms
      ),
      'lastFailure', case when failure.key_model_id is null then null else jsonb_build_object(
        'at', failure.created_at,
        'kind', failure.error_kind,
        'message', failure.error_message,
        'featureKey', failure.feature_key
      ) end
    ) order by c.model_id, c.key_model_id
  ), '[]'::jsonb) as value
  from channel_ids c
  left join lateral (
    select
      count(*)::integer as calls,
      round(count(*) filter (where is_success)::numeric / nullif(count(*), 0), 4) as success_rate,
      round(avg(duration_ms) filter (where is_success))::integer as avg_ms
    from channel_long rows
    where rows.key_model_id = c.key_model_id
  ) long_stats on true
  left join lateral (
    select
      count(*)::integer as calls,
      round(count(*) filter (where is_success)::numeric / nullif(count(*), 0), 4) as success_rate,
      round(avg(duration_ms) filter (where is_success))::integer as avg_ms
    from channel_recent rows
    where rows.key_model_id = c.key_model_id
  ) recent_stats on true
  left join channel_last_failure failure on failure.key_model_id = c.key_model_id
),
feature_stats as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'featureKey', f.feature_key,
      'recent1000', jsonb_build_object(
        'calls', coalesce(long_stats.calls, 0),
        'successRate', long_stats.success_rate,
        'avgMs', long_stats.avg_ms,
        'rescuedCount', coalesce(long_stats.rescued_count, 0)
      ),
      'recent', jsonb_build_object(
        'calls', coalesce(recent_stats.calls, 0),
        'successRate', recent_stats.success_rate,
        'avgMs', recent_stats.avg_ms,
        'rescuedCount', coalesce(recent_stats.rescued_count, 0)
      )
    ) order by f.feature_key
  ), '[]'::jsonb) as value
  from feature_ids f
  left join lateral (
    select
      count(*)::integer as calls,
      round(count(*) filter (where is_success)::numeric / nullif(count(*), 0), 4) as success_rate,
      round(avg(duration_ms) filter (where is_success))::integer as avg_ms,
      count(*) filter (where rescued)::integer as rescued_count
    from feature_long rows
    where rows.feature_key = f.feature_key
  ) long_stats on true
  left join lateral (
    select
      count(*)::integer as calls,
      round(count(*) filter (where is_success)::numeric / nullif(count(*), 0), 4) as success_rate,
      round(avg(duration_ms) filter (where is_success))::integer as avg_ms,
      count(*) filter (where rescued)::integer as rescued_count
    from feature_recent rows
    where rows.feature_key = f.feature_key
  ) recent_stats on true
),
recent_failures as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'at', failure.created_at,
      'featureKey', failure.feature_key,
      'modelId', failure.model_id,
      'keyModelId', coalesce(failure.key_model_id::text, ''),
      'kind', failure.error_kind,
      'message', failure.error_message,
      'rescued', exists (
        select 1 from base success
        where success.request_id = failure.request_id
          and success.is_success = true
      ),
      'isProbe', failure.is_probe
    ) order by failure.created_at desc, failure.id desc
  ), '[]'::jsonb) as value
  from (
    select *
    from base failure
    where failure.is_success = false
    order by failure.created_at desc, failure.id desc
    limit 100
  ) failure
)
select jsonb_build_object(
  'generatedAt', now(),
  'channels', channel_stats.value,
  'features', feature_stats.value,
  'recentFailures', recent_failures.value
)
from channel_stats, feature_stats, recent_failures;
$$;

revoke all on function public.get_ai_call_stats() from public, anon, authenticated;
grant execute on function public.get_ai_call_stats() to service_role;
