-- 选题池聚合下沉：一次 RPC 按 topic 返回内部成绩/达标汇总/最新作品时间/近 7 天热度，
-- 替代 loadTopicPool 三条路径各自对 videos 全量扫描 + 内存聚合（作品行数随数据量线性增长）。
-- 语义对齐 service.ts 的 calculateTopicWorkSummary / computeInternalMetrics / computeRecent7dHeat：
-- - 每条视频的 playCount = 其所有快照的最大播放（无快照记 0）；
-- - summary 只统计达标（>=30000）作品；internalMetrics 统计全部作品；
-- - 近 7 天热度按全量成员统计（不受 p_visible_user_ids 限制），完成=近 7 天有作品上传、在写=近 7 天开始写作；
-- - 只统计 in_library 子题关联作品，与选题池三条查询路径的范围一致。
-- 只读函数：不改任何表、不涉及 RLS 变更；调用方为 service-role admin client（应用层已做 scope 过滤）。

create or replace function public.topics_pool_aggregates(
  p_visible_user_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with pool_topics as (
  select id from public.sub_topics where library_status = 'in_library'
),
scoped_works as (
  select
    v.topic_id,
    v.content,
    v.uploaded_at,
    coalesce(
      (select max(s.play_count) from public.video_metrics_snapshots s where s.video_id = v.id),
      0
    ) as play_count
  from public.videos v
  where v.lifecycle_state = 'active'
    and v.topic_id in (select id from pool_topics)
    and (p_visible_user_ids is null or v.user_id = any(p_visible_user_ids))
),
per_topic as (
  select
    w.topic_id,
    count(*)::int as work_count,
    max(w.play_count) as internal_best_play,
    round(avg(w.play_count))::int as internal_avg_play,
    sum(case when w.play_count >= 30000 then 1 else 0 end)::int as qualified_count,
    sum(case when w.play_count >= 30000 then w.play_count else 0 end)::bigint as qualified_play_total,
    max(case when w.play_count >= 30000 then w.play_count end) as best_qualified_play,
    max(w.uploaded_at) as latest_uploaded_at
  from scoped_works w
  group by w.topic_id
),
best_copy as (
  select distinct on (w.topic_id) w.topic_id, w.content
  from scoped_works w
  where w.play_count >= 30000
  order by w.topic_id, w.play_count desc, w.uploaded_at desc nulls last
),
latest_copy as (
  select distinct on (w.topic_id) w.topic_id, w.content
  from scoped_works w
  where w.play_count >= 30000 and w.uploaded_at is not null
  order by w.topic_id, w.uploaded_at desc
),
heat_works as (
  select v.topic_id, v.user_id
  from public.videos v
  where v.lifecycle_state = 'active'
    and v.topic_id in (select id from pool_topics)
    and v.user_id is not null
    and v.uploaded_at >= now() - interval '7 days'
),
heat_writing as (
  select c.sub_topic_id as topic_id, c.user_id
  from public.sub_topic_claims c
  where c.status = 'writing'
    and c.user_id is not null
    and c.claimed_at >= now() - interval '7 days'
),
heat_users as (
  select topic_id, user_id, true as is_completed from heat_works
  union
  select topic_id, user_id, false as is_completed from heat_writing
),
heat as (
  select
    topic_id,
    count(distinct user_id) filter (where is_completed)::int as completed_count,
    count(distinct user_id) filter (where not is_completed)::int as in_progress_count,
    count(distinct user_id)::int as participants
  from heat_users
  group by topic_id
)
select coalesce(
  jsonb_object_agg(
    t.topic_id,
    jsonb_build_object(
      'workCount', t.work_count,
      'internalBestPlay', t.internal_best_play,
      'internalAvgPlay', t.internal_avg_play,
      'qualifiedWorkCount', t.qualified_count,
      'averagePlayCount', case when t.qualified_count > 0 then round(t.qualified_play_total::numeric / t.qualified_count)::int end,
      'bestPlayCount', t.best_qualified_play,
      'bestCopy', bc.content,
      'latestCopy', lc.content,
      'latestUploadedAt', t.latest_uploaded_at,
      'completedCount', coalesce(h.completed_count, 0),
      'inProgressCount', coalesce(h.in_progress_count, 0),
      'participants', coalesce(h.participants, 0)
    )
  ),
  '{}'::jsonb
)
from per_topic t
left join best_copy bc on bc.topic_id = t.topic_id
left join latest_copy lc on lc.topic_id = t.topic_id
left join heat h on h.topic_id = t.topic_id
$$;
