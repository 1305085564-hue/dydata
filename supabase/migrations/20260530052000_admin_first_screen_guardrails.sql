-- ============================================================
-- 078: admin first-screen guardrails
-- 目标：将 analytics / sidebar-badges 首屏读数下沉到 read-model，
--       并补齐首屏性能事件采集与连续超阈值告警。
-- ============================================================

create table if not exists public.admin_first_screen_perf_events (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  status_code integer not null,
  auth_ms integer not null default 0,
  context_ms integer not null default 0,
  data_ms integer not null default 0,
  total_ms integer not null default 0,
  actor_user_id uuid references public.profiles(id) on delete set null,
  scope_kind text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_first_screen_perf_events_route_created_at
  on public.admin_first_screen_perf_events (route, created_at desc);

create index if not exists idx_admin_first_screen_perf_events_total_ms
  on public.admin_first_screen_perf_events (total_ms desc);

grant select, insert on public.admin_first_screen_perf_events to service_role;

create or replace function public.admin_analytics_first_screen(
  p_visible_user_ids uuid[],
  p_user_id uuid,
  p_role text,
  p_current_user_name text,
  p_from date,
  p_to date,
  p_should_load_previous_period boolean default true,
  p_previous_from date default null,
  p_previous_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_visible_user_ids is null or array_length(p_visible_user_ids, 1) is null then
    return jsonb_build_object(
      'role', coalesce(p_role, 'member'),
      'isPrivilegedUser', false,
      'currentUserName', coalesce(nullif(btrim(p_current_user_name), ''), '我'),
      'submitters', '[]'::jsonb,
      'filteredReports', '[]'::jsonb,
      'previousPeriodReports', '[]'::jsonb
    );
  end if;

  return (
    with scoped_reports as (
      select
        dr.id,
        dr.user_id,
        dr.account_id,
        dr.submitter,
        dr.title,
        dr.report_date,
        dr.play_count,
        dr.completion_rate,
        dr.avg_play_duration,
        dr.bounce_rate_2s,
        dr.completion_rate_5s,
        dr.likes,
        dr.comments,
        dr.shares,
        dr.favorites,
        dr.follower_gain,
        dr.follower_convert,
        dr.content,
        dr.published_at,
        dr.uploaded_at
      from public.daily_reports dr
      where dr.user_id = any(p_visible_user_ids)
        and dr.report_date >= p_from
        and dr.report_date <= p_to
    ),
    previous_reports as (
      select
        dr.id,
        dr.user_id,
        dr.account_id,
        dr.submitter,
        dr.title,
        dr.report_date,
        dr.play_count,
        dr.completion_rate,
        dr.avg_play_duration,
        dr.bounce_rate_2s,
        dr.completion_rate_5s,
        dr.likes,
        dr.comments,
        dr.shares,
        dr.favorites,
        dr.follower_gain,
        dr.follower_convert,
        dr.content,
        dr.published_at,
        dr.uploaded_at
      from public.daily_reports dr
      where p_should_load_previous_period = true
        and p_previous_from is not null
        and p_previous_to is not null
        and dr.user_id = any(p_visible_user_ids)
        and dr.report_date >= p_previous_from
        and dr.report_date <= p_previous_to
    ),
    submitter_rows as (
      select distinct submitter
      from scoped_reports
      where coalesce(nullif(btrim(submitter), ''), '') <> ''
    )
    select jsonb_build_object(
      'role', coalesce(p_role, 'member'),
      'isPrivilegedUser', array_length(p_visible_user_ids, 1) > 1,
      'currentUserName', coalesce(nullif(btrim(p_current_user_name), ''), '我'),
      'submitters',
      coalesce((
        select jsonb_agg(sr.submitter order by sr.submitter asc)
        from submitter_rows sr
      ), '[]'::jsonb),
      'filteredReports',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sr.id,
            'user_id', sr.user_id,
            'account_id', sr.account_id,
            'submitter', sr.submitter,
            'title', sr.title,
            'report_date', sr.report_date,
            'play_count', sr.play_count,
            'completion_rate', sr.completion_rate,
            'avg_play_duration', sr.avg_play_duration,
            'bounce_rate_2s', sr.bounce_rate_2s,
            'completion_rate_5s', sr.completion_rate_5s,
            'likes', sr.likes,
            'comments', sr.comments,
            'shares', sr.shares,
            'favorites', sr.favorites,
            'follower_gain', sr.follower_gain,
            'follower_convert', sr.follower_convert,
            'content', sr.content,
            'published_at', sr.published_at,
            'uploaded_at', sr.uploaded_at,
            'cover_url', null
          )
          order by sr.report_date desc, sr.id desc
        )
        from scoped_reports sr
      ), '[]'::jsonb),
      'previousPeriodReports',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'user_id', pr.user_id,
            'account_id', pr.account_id,
            'submitter', pr.submitter,
            'title', pr.title,
            'report_date', pr.report_date,
            'play_count', pr.play_count,
            'completion_rate', pr.completion_rate,
            'avg_play_duration', pr.avg_play_duration,
            'bounce_rate_2s', pr.bounce_rate_2s,
            'completion_rate_5s', pr.completion_rate_5s,
            'likes', pr.likes,
            'comments', pr.comments,
            'shares', pr.shares,
            'favorites', pr.favorites,
            'follower_gain', pr.follower_gain,
            'follower_convert', pr.follower_convert,
            'content', pr.content,
            'published_at', pr.published_at,
            'uploaded_at', pr.uploaded_at,
            'cover_url', null
          )
          order by pr.report_date desc, pr.id desc
        )
        from previous_reports pr
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.admin_analytics_first_screen(uuid[], uuid, text, text, date, date, boolean, date, date) to authenticated, service_role;

create or replace function public.admin_sidebar_badges_summary(
  p_target_date date default current_date,
  p_visible_user_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pending_videos_count int := 0;
  pending_submissions_count int := 0;
  pending_violations_count int := 0;
  content_pending_count int := 0;
  recent_review_window_start timestamptz := now() - interval '3 days';
begin
  if p_visible_user_ids is null or array_length(p_visible_user_ids, 1) is null then
    return jsonb_build_object(
      'cockpit', 0,
      'videos', 0,
      'content', 0,
      'conversion_hub', 0,
      'ai_channels', 0
    );
  end if;

  select count(*)::int
  into pending_videos_count
  from public.videos v
  where v.user_id = any(p_visible_user_ids)
    and (
      ((v.created_at at time zone 'Asia/Shanghai')::date = p_target_date)
      or exists (
        select 1
        from public.daily_reports dr
        where dr.id = v.id
          and dr.report_date = p_target_date
      )
    )
    and (
      v.anomaly_status <> '正常'
      or not exists (
        select 1
        from public.video_tags vt
        where vt.video_id = v.id
      )
    );

  select count(*)::int
  into pending_submissions_count
  from public.profiles p
  where p.id = any(p_visible_user_ids)
    and coalesce(p.status, 'active') = 'active'
    and not (
      coalesce(p.exempt_type, '') = 'permanent'
      or (
        p.exempt_type = 'temporary'
        and p.exempt_start_date is not null
        and p.exempt_end_date is not null
        and p_target_date between p.exempt_start_date and p.exempt_end_date
      )
      or exists (
        select 1
        from public.exemption_grant eg
        where eg.user_id = p.id
          and eg.status = 'active'
          and eg.start_date is not null
          and p_target_date >= eg.start_date
          and (eg.end_date is null or p_target_date <= eg.end_date)
      )
    )
    and not exists (
      select 1
      from public.daily_reports dr
      where dr.user_id = p.id
        and dr.report_date = p_target_date
    );

  select count(*)::int
  into pending_violations_count
  from public.violation_cases vc
  where vc.status = 'submitted'
    and vc.is_deleted = false
    and vc.submitted_by = any(p_visible_user_ids);

  with reviewed_videos as (
    select distinct (air.result_json ->> 'video_id') as video_id
    from public.ai_insight_result air
    where air.insight_type = 'next_day_review'
      and air.result_status = 'success'
      and air.created_at >= recent_review_window_start
  )
  select count(*)::int
  into content_pending_count
  from public.videos v
  where v.user_id = any(p_visible_user_ids)
    and v.created_at >= now() - interval '1 day'
    and not exists (
      select 1
      from reviewed_videos rv
      where rv.video_id = v.id::text
    );

  return jsonb_build_object(
    'cockpit', pending_videos_count + pending_submissions_count + pending_violations_count,
    'videos', pending_videos_count,
    'content', content_pending_count,
    'conversion_hub', pending_violations_count,
    'ai_channels', 0
  );
end;
$$;

grant execute on function public.admin_sidebar_badges_summary(date, uuid[]) to authenticated, service_role;

create or replace function public.admin_first_screen_perf_regressions(
  p_route text,
  p_threshold_ms integer,
  p_window_minutes integer default 30
)
returns table (
  route text,
  status_code integer,
  latest_total_ms integer,
  consecutive_hits integer
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select
      e.route,
      e.status_code,
      e.total_ms,
      e.created_at,
      row_number() over (order by e.created_at desc) as seq
    from public.admin_first_screen_perf_events e
    where e.route = p_route
      and e.created_at >= now() - make_interval(mins => greatest(coalesce(p_window_minutes, 30), 1))
    order by e.created_at desc
    limit 20
  ),
  flagged as (
    select
      route,
      status_code,
      total_ms,
      seq,
      case when status_code >= 500 or total_ms >= p_threshold_ms then 1 else 0 end as is_hot
    from recent
  )
  select
    f.route,
    f.status_code,
    f.total_ms as latest_total_ms,
    count(*) filter (where f2.is_hot = 1) as consecutive_hits
  from flagged f
  join flagged f2 on f2.seq <= f.seq
  where f.seq = 1
    and not exists (
      select 1
      from flagged earlier
      where earlier.seq < f2.seq
        and earlier.is_hot = 0
    )
  group by f.route, f.status_code, f.total_ms;
$$;

grant execute on function public.admin_first_screen_perf_regressions(text, integer, integer) to service_role;
