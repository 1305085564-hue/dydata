-- 选题池所有作品日期统一按视频真实发布日期计算；没有发布日的历史作品回退上传时间，
-- 与应用侧「发布日优先、无发布日回退上传日」口径一致，上传时间兼作稳定排序依据。

create or replace function public.topics_pool_aggregates(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with team_members as (
  select p.id
  from public.profiles p
  where p.team_id = p_team_id
),
pool_topics as (
  select st.id
  from public.sub_topics st
  join public.profiles creator on creator.id = st.created_by
  where st.library_status = 'in_library'
    and creator.team_id = p_team_id
),
team_videos as materialized (
  select
    v.id, v.topic_id, v.user_id, v.content, v.published_at, v.uploaded_at,
    coalesce(v.published_at, v.uploaded_at) as work_at
  from public.videos v
  join team_members member on member.id = v.user_id
  join pool_topics topic on topic.id = v.topic_id
  where v.lifecycle_state = 'active'
),
snapshot_max as (
  select s.video_id, max(s.play_count) as play_count
  from public.video_metrics_snapshots s
  join team_videos video on video.id = s.video_id
  group by s.video_id
),
scoped_works as (
  select
    video.topic_id,
    video.user_id,
    video.content,
    video.work_at,
    coalesce(snapshot.play_count, 0) as play_count
  from team_videos video
  left join snapshot_max snapshot on snapshot.video_id = video.id
),
work_metrics as (
  select
    topic_id,
    count(*)::int as work_count,
    max(play_count) as internal_best_play,
    round(avg(play_count))::int as internal_avg_play,
    count(*) filter (where play_count >= 30000)::int as qualified_count,
    sum(play_count) filter (where play_count >= 30000)::bigint as qualified_play_total,
    max(work_at) as latest_published_at
  from scoped_works
  group by topic_id
),
best_copy as (
  select distinct on (topic_id) topic_id, content
  from scoped_works
  where play_count >= 30000
  order by topic_id, play_count desc, work_at desc nulls last
),
latest_copy as (
  select distinct on (topic_id) topic_id, content
  from scoped_works
  where play_count >= 30000
  order by topic_id, work_at desc nulls last
),
recent_works as (
  select topic_id, user_id
  from team_videos
  where work_at >= now() - interval '7 days'
),
team_writing as materialized (
  select claim.sub_topic_id as topic_id, claim.user_id, claim.claimed_at
  from public.sub_topic_claims claim
  join team_members member on member.id = claim.user_id
  join pool_topics topic on topic.id = claim.sub_topic_id
  where claim.status = 'writing'
),
recent_writing as (
  select topic_id, user_id
  from team_writing
  where claimed_at >= now() - interval '7 days'
),
recent_users as (
  select topic_id, user_id, true as is_completed from recent_works
  union
  select topic_id, user_id, false as is_completed from recent_writing
),
heat as (
  select
    topic_id,
    count(distinct user_id) filter (where is_completed)::int as completed_count,
    count(distinct user_id) filter (where not is_completed)::int as in_progress_count,
    count(distinct user_id)::int as participants
  from recent_users
  group by topic_id
),
current_writing as (
  select topic_id, count(distinct user_id)::int as current_writing_count
  from team_writing
  group by topic_id
)
select coalesce(jsonb_object_agg(
  topic.id,
  jsonb_build_object(
    'workCount', coalesce(metrics.work_count, 0),
    'internalBestPlay', metrics.internal_best_play,
    'internalAvgPlay', metrics.internal_avg_play,
    'qualifiedWorkCount', coalesce(metrics.qualified_count, 0),
    'averagePlayCount', case
      when coalesce(metrics.qualified_count, 0) > 0
        then round(metrics.qualified_play_total::numeric / metrics.qualified_count)::int
      else null
    end,
    'bestPlayCount', metrics.internal_best_play,
    'bestCopy', best.content,
    'latestCopy', latest.content,
    'latestPublishedAt', metrics.latest_published_at,
    'completedCount', coalesce(recent.completed_count, 0),
    'inProgressCount', coalesce(recent.in_progress_count, 0),
    'participants', coalesce(recent.participants, 0),
    'currentWritingCount', coalesce(writing.current_writing_count, 0)
  )
), '{}'::jsonb)
from pool_topics topic
left join work_metrics metrics on metrics.topic_id = topic.id
left join best_copy best on best.topic_id = topic.id
left join latest_copy latest on latest.topic_id = topic.id
left join heat recent on recent.topic_id = topic.id
left join current_writing writing on writing.topic_id = topic.id
$$;

revoke execute on function public.topics_pool_aggregates(uuid) from public, anon, authenticated;
grant execute on function public.topics_pool_aggregates(uuid) to service_role;

notify pgrst, 'reload schema';
