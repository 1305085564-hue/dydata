-- 评价标准：列表综合评级筛选/排序使用服务端传入的公司达标基准。
-- 兼容：未传evaluationTargets时沿用3.5%/2%，不改变签名、权限与旧调用行为。
-- 回滚：恢复20261025100000的同名函数；system_settings配置无结构变更。
create or replace function public.admin_content_list_page(
  p_view text,
  p_page integer,
  p_page_size integer,
  p_cursor jsonb,
  p_sort_field text,
  p_sort_dir text,
  p_visible_user_ids uuid[],
  p_filters jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with args as (
  select
    case when p_view = 'trash' then 'trashed' else 'active' end as lifecycle_state,
    greatest(1, least(coalesce(p_page, 1), 10000)) as page,
    case when p_page_size in (20, 30, 50, 100, 500) then p_page_size else 20 end as page_size,
    case when p_sort_field in (
      'published_at', 'overall_grade', 'core_metric', 'play_count', 'follower_gain',
      'likes', 'comments', 'shares', 'favorites', 'interaction_rate', 'bounce_rate_2s',
      'completion_rate_5s', 'avg_play_duration', 'completion_rate'
    ) then p_sort_field else 'published_at' end as sort_field,
    case when p_sort_dir in ('asc', 'desc') then p_sort_dir else 'desc' end as sort_dir,
    coalesce(p_filters, '{}'::jsonb) as filters
), scoped_videos as materialized (
  -- 日期目录只依赖人员、账号、关键词；不读取快照、标签或入库关联。
  select v.id, v.account_id, v.user_id, v.video_title, v.published_at, v.uploaded_at,
    v.anomaly_status, v.lifecycle_state, v.topic_id,
    v.content is not null and btrim(v.content) <> '' as has_content,
    a.name as account_name, a.profile_id as account_profile_id, p.name as profile_name,
    to_char(v.published_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') as published_date
  from public.videos v
  join public.accounts a on a.id = v.account_id
  join public.profiles p on p.id = v.user_id
  cross join args cfg
  where v.lifecycle_state = cfg.lifecycle_state
    and coalesce(a.profile_id, v.user_id) = any(coalesce(p_visible_user_ids, array[]::uuid[]))
    and (nullif(cfg.filters->>'userId', '') is null or coalesce(a.profile_id, v.user_id) = nullif(cfg.filters->>'userId', '')::uuid)
    and (nullif(cfg.filters->>'accountId', '') is null or v.account_id = nullif(cfg.filters->>'accountId', '')::uuid)
    and (nullif(btrim(cfg.filters->>'keyword'), '') is null or
      strpos(lower(coalesce(v.video_title, '') || E'\n' || coalesce(v.content, '')), lower(btrim(cfg.filters->>'keyword'))) > 0)
), dated_base as materialized (
  -- 按日期分页：传了日期就用日期范围；没传就默认最新有数据的那一天
  select b.*
  from scoped_videos b
  cross join args cfg
  where case
      when nullif(cfg.filters->>'startDate', '') is not null or nullif(cfg.filters->>'endDate', '') is not null then
        (nullif(cfg.filters->>'startDate', '') is null or b.published_date >= cfg.filters->>'startDate')
        and (nullif(cfg.filters->>'endDate', '') is null or b.published_date <= cfg.filters->>'endDate')
      else
        b.published_date = (select max(published_date) from scoped_videos)
    end
), base as materialized (
  select
    v.id,
    v.account_id,
    v.user_id,
    coalesce(v.account_profile_id, v.user_id) as owner_user_id,
    v.video_title,
    v.published_at,
    v.uploaded_at,
    v.anomaly_status,
    v.lifecycle_state,
    v.topic_id,
    v.account_name,
    v.account_profile_id,
    v.profile_name,
    v.has_content,
    exists (select 1 from public.video_content_segments seg where seg.video_id = v.id) as has_segments,
    tag.tag_value as topic_tag,
    snap.id as snapshot_id,
    snap.snapshot_type,
    snap.captured_at,
    snap.play_count,
    snap.likes,
    snap.comments,
    snap.shares,
    snap.favorites,
    snap.follower_gain,
    snap.bounce_rate_2s,
    snap.completion_rate_5s,
    snap.avg_play_duration,
    snap.completion_rate,
    case
      when tag.tag_value in ('复盘', '复盘干货') then 'review_excluded'
      when tag.tag_value is distinct from '干货'
        or snap.id is null
        or coalesce(snap.play_count, 0) < 30000 then 'ineligible'
      when excluded_sub.id is not null then 'removed'
      when coalesce(linked_sub.library_status, 'in_library') = 'removed' then 'removed'
      when linked_sub.id is null then 'pending_entry'
      else 'in_library'
    end as topic_library_status,
    case
      when v.anomaly_status in ('删稿', 'deleted') then 'deleted'
      when v.anomaly_status in ('限流', 'limited') then 'limited'
      when v.anomaly_status in (
        'abnormal', '异常', '投流', '活动干预', 'traffic_boost', 'paid_boost',
        'activity_boost', 'campaign_intervention'
      ) then 'abnormal'
      else null
    end as anomaly_bucket
  from dated_base v
  left join lateral (
    select s.*
    from public.video_metrics_snapshots s
    where s.video_id = v.id and s.snapshot_type = '24h'
    order by s.captured_at desc nulls last, s.id asc
    limit 1
  ) snap on true
  left join lateral (
    select vt.tag_value
    from public.video_tags vt
    where vt.video_id = v.id and vt.tag_dimension = '话题'
    order by vt.tag_value nulls last
    limit 1
  ) tag on true
  left join lateral (
    select st.id, st.library_status
    from public.sub_topics st
    where st.id = v.topic_id or st.source_video_id = v.id
    order by (st.id = v.topic_id) desc, st.id asc
    limit 1
  ) linked_sub on true
  left join lateral (
    select st.id
    from public.sub_topics st
    where st.source_video_id = v.id and st.library_status = 'removed'
    limit 1
  ) excluded_sub on true
), metrics as materialized (
  select
    b.*,
    case when b.play_count > 0 then b.play_count::numeric else null end as play_numeric,
    case
      when b.play_count > 0
        and b.likes is not null and b.comments is not null and b.shares is not null and b.favorites is not null
        and b.likes >= 0 and b.comments >= 0 and b.shares >= 0 and b.favorites >= 0
        and b.likes <= b.play_count and b.comments <= b.play_count and b.shares <= b.play_count and b.favorites <= b.play_count
        and b.likes::numeric + b.comments + b.shares + b.favorites <= b.play_count
      then (b.likes::numeric + b.comments + b.shares + b.favorites) / b.play_count::numeric * 100
      else null
    end as interaction_rate,
    case
      when b.play_count > 0
        and case when b.topic_tag = '干货' then b.favorites else b.likes end is not null
        and case when b.topic_tag = '干货' then b.favorites else b.likes end >= 0
        and case when b.topic_tag = '干货' then b.favorites else b.likes end <= b.play_count
      then case when b.topic_tag = '干货' then b.favorites else b.likes end::numeric / b.play_count::numeric * 100
      else null
    end as core_metric_rate,
    case when b.play_count > 0 and b.follower_gain between 0 and b.play_count then b.follower_gain::numeric / b.play_count::numeric * 100 else null end as follower_rate,
    case when b.bounce_rate_2s between 0 and 100 then b.bounce_rate_2s else null end as sortable_bounce_rate,
    case when b.completion_rate_5s between 0 and 100 then b.completion_rate_5s else null end as sortable_completion_rate_5s,
    case when b.completion_rate between 0 and 100 then b.completion_rate else null end as sortable_completion_rate,
    case when b.topic_tag = '干货' then 'dry_goods'
      when b.topic_tag in ('复盘', '复盘干货') then 'review'
      else 'other' end as topic_kind
  from base b
), evaluation_targets as materialized (
  select m.*,
    coalesce(nullif((cfg.filters #>> '{evaluationTargets,interactionRate}')::numeric, 0), 3.5) as interaction_target,
    case when m.topic_kind = 'dry_goods'
      then coalesce(nullif((cfg.filters #>> '{evaluationTargets,dryFavoriteRate}')::numeric, 0), 2.0)
      else coalesce(nullif((cfg.filters #>> '{evaluationTargets,reviewLikeRate}')::numeric, 0), 2.0)
    end as core_target
  from metrics m cross join args cfg
), ratings as materialized (
  select m.*,
    case when m.interaction_rate is not null then m.interaction_rate / m.interaction_target * 100 end as interaction_achievement,
    case when m.core_metric_rate is not null then m.core_metric_rate / m.core_target * 100 end as core_achievement,
    case
      when m.play_count is not null and m.play_count < 5000 then 0
      when m.interaction_rate is null or m.core_metric_rate is null then null
      else least(
        case
          when (m.interaction_rate / m.interaction_target * 100 + m.core_metric_rate / m.core_target * 100) / 2 >= 100 then 3
          when (m.interaction_rate / m.interaction_target * 100 + m.core_metric_rate / m.core_target * 100) / 2 >= 80 then 2
          when (m.interaction_rate / m.interaction_target * 100 + m.core_metric_rate / m.core_target * 100) / 2 >= 60 then 1
          else 0
        end,
        least(
          case when least(m.interaction_rate / m.interaction_target * 100, m.core_metric_rate / m.core_target * 100) >= 100 then 3
            when least(m.interaction_rate / m.interaction_target * 100, m.core_metric_rate / m.core_target * 100) >= 80 then 2
            when least(m.interaction_rate / m.interaction_target * 100, m.core_metric_rate / m.core_target * 100) >= 60 then 1 else 0 end + 1,
          3
        ),
        case when m.play_count >= 15000 then 3 else 1 end
      )
    end as overall_grade_rank
  from evaluation_targets m
), derived as materialized (
  select r.*,
    case r.overall_grade_rank when 3 then '优' when 2 then '良' when 1 then '普' when 0 then '劣' else null end as overall_grade,
    case r.overall_grade_rank when 3 then 4 when 2 then 3 when 1 then 2 when 0 then 1 else 0 end as grade_sort_rank,
    case
      when r.sortable_bounce_rate is null then null
      when r.sortable_bounce_rate >= 30 then 1 else 0 end as bounce_warning,
    case
      when r.sortable_completion_rate_5s is null then null
      when r.sortable_completion_rate_5s < 50 then 1 else 0 end as completion_5s_warning,
    case
      when r.avg_play_duration is null then null
      when r.avg_play_duration < 30 then 1 else 0 end as duration_warning,
    case
      when r.sortable_completion_rate is null then null
      when r.sortable_completion_rate < 5 then 1 else 0 end as completion_warning
  from ratings r
), filtered as materialized (
  select d.*,
    case when d.anomaly_bucket in ('deleted', 'limited') then 1000
      when d.anomaly_bucket = 'abnormal' then 100 else 0 end
      + (coalesce(d.bounce_warning, 0) + coalesce(d.completion_5s_warning, 0) + coalesce(d.duration_warning, 0) + coalesce(d.completion_warning, 0)) * 80
      + case when not d.has_content then 20 when not d.has_segments or d.snapshot_id is null then 20 else 0 end as review_priority,
    case (select cfg.sort_field from args cfg)
      when 'published_at' then coalesce(extract(epoch from d.published_at), 0)::numeric
      when 'overall_grade' then d.grade_sort_rank::numeric
      when 'core_metric' then d.core_metric_rate
      when 'play_count' then d.play_count::numeric
      when 'follower_gain' then d.follower_gain::numeric
      when 'likes' then d.likes::numeric
      when 'comments' then d.comments::numeric
      when 'shares' then d.shares::numeric
      when 'favorites' then d.favorites::numeric
      when 'interaction_rate' then d.interaction_rate
      when 'bounce_rate_2s' then d.sortable_bounce_rate
      when 'completion_rate_5s' then d.sortable_completion_rate_5s
      when 'avg_play_duration' then d.avg_play_duration
      when 'completion_rate' then d.sortable_completion_rate
      else coalesce(extract(epoch from d.published_at), 0)::numeric
    end as sort_value
  from derived d
  cross join args cfg
  where (coalesce(cfg.filters->>'playBucket', '') = '' or (
      d.play_count is not null and (
        case cfg.filters->>'playBucket'
          when 'lt2k' then d.play_count >= 0 and d.play_count < 2000
          when '2k-5k' then d.play_count >= 2000 and d.play_count < 5000
          when '5k-2w' then d.play_count >= 5000 and d.play_count < 20000
          when '2w-5w' then d.play_count >= 20000 and d.play_count < 50000
          when 'ge5w' then d.play_count >= 50000
          when 'custom' then
            (coalesce(cfg.filters->>'playMin', '') = '' or d.play_count >= (cfg.filters->>'playMin')::numeric)
            and (coalesce(cfg.filters->>'playMax', '') = '' or d.play_count < (cfg.filters->>'playMax')::numeric)
          else true
        end
      )
    ))
    and (coalesce(cfg.filters->>'qualityGrade', 'all') = 'all' or
      case cfg.filters->>'qualityGrade'
        when 'excellent' then d.overall_grade = '优'
        when 'good' then d.overall_grade = '良'
        when 'fair' then d.overall_grade = '普'
        when 'poor' then d.overall_grade = '劣'
        when 'unrated' then d.overall_grade is null
        else true end)
    and (coalesce((cfg.filters->>'onlyAnomaly')::boolean, false) = false or d.anomaly_bucket is not null)
    and (coalesce(cfg.filters->>'topicStatus', 'all') = 'all' or
      (cfg.filters->>'topicStatus' = 'in_library' and d.topic_library_status = 'in_library') or
      (cfg.filters->>'topicStatus' = 'removed' and d.topic_library_status = 'removed'))
    and (coalesce((cfg.filters->>'highlightOnly')::boolean, false) = false or not exists (
      select 1
      from jsonb_each(coalesce(cfg.filters->'highlightRules', '{}'::jsonb)) rule
      where case rule.key
        when 'playCount' then d.play_count::numeric
        when 'followerGain' then d.follower_gain::numeric
        when 'likes' then d.likes::numeric
        when 'comments' then d.comments::numeric
        when 'shares' then d.shares::numeric
        when 'favorites' then d.favorites::numeric
        when 'interactionRate' then d.interaction_rate
        when 'coreMetricRate' then d.core_metric_rate
        when 'bounceRate2s' then d.sortable_bounce_rate
        when 'completionRate5s' then d.sortable_completion_rate_5s
        when 'avgPlayDuration' then d.avg_play_duration
        when 'completionRate' then d.sortable_completion_rate
        else null end is null
        or (
          nullif(rule.value->>'min', '') is not null
          and case rule.key
            when 'playCount' then d.play_count::numeric
            when 'followerGain' then d.follower_gain::numeric
            when 'likes' then d.likes::numeric
            when 'comments' then d.comments::numeric
            when 'shares' then d.shares::numeric
            when 'favorites' then d.favorites::numeric
            when 'interactionRate' then d.interaction_rate
            when 'coreMetricRate' then d.core_metric_rate
            when 'bounceRate2s' then d.sortable_bounce_rate
            when 'completionRate5s' then d.sortable_completion_rate_5s
            when 'avgPlayDuration' then d.avg_play_duration
            when 'completionRate' then d.sortable_completion_rate
            else null end < (rule.value->>'min')::numeric
        )
        or (
          nullif(rule.value->>'max', '') is not null
          and case rule.key
            when 'playCount' then d.play_count::numeric
            when 'followerGain' then d.follower_gain::numeric
            when 'likes' then d.likes::numeric
            when 'comments' then d.comments::numeric
            when 'shares' then d.shares::numeric
            when 'favorites' then d.favorites::numeric
            when 'interactionRate' then d.interaction_rate
            when 'coreMetricRate' then d.core_metric_rate
            when 'bounceRate2s' then d.sortable_bounce_rate
            when 'completionRate5s' then d.sortable_completion_rate_5s
            when 'avgPlayDuration' then d.avg_play_duration
            when 'completionRate' then d.sortable_completion_rate
            else null end >= (rule.value->>'max')::numeric
        )
    ))
), available_dates as (
  -- 当前筛选范围内（不含日期过滤）有作品的日期与当日条数，日期降序，供前端日期翻页器使用。
  -- pub_date 按上海自然日分组；availableDates 与 availableCounts 保持降序、同序兼容。
  select published_date as pub_date, count(*)::integer as video_count
  from scoped_videos
  where published_at is not null
  group by 1
  order by 1 desc
), totals as (
  select count(*)::integer as total_count,
    count(*) filter (where anomaly_bucket is not null)::integer as anomaly_count
  from filtered
), page_rows as (
  select f.*
  from filtered f
  cross join args cfg
  where p_cursor is null
    or nullif(p_cursor->>'id', '') is null
    or case
      when p_cursor->>'sortValue' is null then
        case when p_cursor->>'direction' = 'before'
          then f.sort_value is not null or (f.sort_value is null and f.id::text < p_cursor->>'id')
          else f.sort_value is null and f.id::text > p_cursor->>'id'
        end
      when p_cursor->>'direction' = 'before' then
        (f.sort_value is not null and (
          (cfg.sort_dir = 'asc' and f.sort_value < (p_cursor->>'sortValue')::numeric)
          or (cfg.sort_dir = 'desc' and f.sort_value > (p_cursor->>'sortValue')::numeric)
          or (f.sort_value = (p_cursor->>'sortValue')::numeric and f.id::text < p_cursor->>'id')
        ))
      else
        f.sort_value is null or (
          f.sort_value is not null and (
            (cfg.sort_dir = 'asc' and f.sort_value > (p_cursor->>'sortValue')::numeric)
            or (cfg.sort_dir = 'desc' and f.sort_value < (p_cursor->>'sortValue')::numeric)
            or (f.sort_value = (p_cursor->>'sortValue')::numeric and f.id::text > p_cursor->>'id')
          )
        )
      end
  order by
    case when p_cursor->>'direction' = 'before' and cfg.sort_dir = 'asc' then f.sort_value end desc nulls first,
    case when p_cursor->>'direction' = 'before' and cfg.sort_dir = 'desc' then f.sort_value end asc nulls first,
    case when p_cursor->>'direction' is distinct from 'before' and cfg.sort_dir = 'asc' then f.sort_value end asc nulls last,
    case when p_cursor->>'direction' is distinct from 'before' and cfg.sort_dir = 'desc' then f.sort_value end desc nulls last,
    case when p_cursor->>'direction' = 'before' then f.id end desc,
    case when p_cursor->>'direction' is distinct from 'before' then f.id end asc
  limit (select page_size from args)
  offset case when p_cursor is null then ((select page - 1 from args) * (select page_size from args)) else 0 end
), enriched as (
  select r.*,
    prev.play_count as previous_play_count,
    case when r.play_count is not null and prev.play_count > 0
      then ((r.play_count::numeric - prev.play_count::numeric) / prev.play_count::numeric) * 100 end as play_count_change_pct,
    case when r.play_count is not null and prev.play_count > 0
      and r.play_count - prev.play_count >= 5000
      and ((r.play_count::numeric - prev.play_count::numeric) / prev.play_count::numeric) >= 1
      then 'surge' end as play_change_signal
  from page_rows r
  left join lateral (
    select ps.play_count
    from public.videos pv
    left join lateral (
      select s.play_count
      from public.video_metrics_snapshots s
      where s.video_id = pv.id and s.snapshot_type = '24h'
      order by s.captured_at desc nulls last, s.id asc
      limit 1
    ) ps on true
    where pv.account_id = r.account_id
      and pv.lifecycle_state = 'active'
      and pv.published_at < r.published_at
    order by pv.published_at desc, pv.id asc
    limit 1
  ) prev on true
), current_cursor as (
  select (select sort_value from page_rows order by
      case when (select sort_dir from args) = 'asc' then sort_value end asc nulls last,
      case when (select sort_dir from args) = 'desc' then sort_value end desc nulls last,
      id asc limit 1) as first_value,
    (select id::text from page_rows order by
      case when (select sort_dir from args) = 'asc' then sort_value end asc nulls last,
      case when (select sort_dir from args) = 'desc' then sort_value end desc nulls last,
      id asc limit 1) as first_id,
    (select sort_value from page_rows order by
      case when (select sort_dir from args) = 'asc' then sort_value end asc nulls last,
      case when (select sort_dir from args) = 'desc' then sort_value end desc nulls last,
      id asc limit 1 offset (select page_size - 1 from args)) as last_value,
    (select id::text from page_rows order by
      case when (select sort_dir from args) = 'asc' then sort_value end asc nulls last,
      case when (select sort_dir from args) = 'desc' then sort_value end desc nulls last,
      id asc limit 1 offset (select page_size - 1 from args)) as last_id
), result_page as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'account_id', account_id,
    'user_id', user_id,
    'video_title', video_title,
    'published_at', published_at,
    'uploaded_at', uploaded_at,
    'anomaly_status', anomaly_status,
    'lifecycle_state', lifecycle_state,
    'topic_id', topic_id,
    'accounts', jsonb_build_object('name', account_name, 'profile_id', account_profile_id),
    'profiles', jsonb_build_object('name', profile_name),
    'topic_tag', topic_tag,
    'has_content', has_content,
    'has_segments', has_segments,
    'previous_play_count', previous_play_count,
    'play_count_change_pct', play_count_change_pct,
    'play_change_signal', play_change_signal
  ) order by
    case when (select sort_dir from args) = 'asc' then sort_value end asc nulls last,
    case when (select sort_dir from args) = 'desc' then sort_value end desc nulls last,
    id asc), '[]'::jsonb) as videos,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', snapshot_id,
      'video_id', id,
      'snapshot_type', snapshot_type,
      'captured_at', captured_at,
      'play_count', play_count,
      'likes', likes,
      'comments', comments,
      'shares', shares,
      'favorites', favorites,
      'follower_gain', follower_gain,
      'bounce_rate_2s', bounce_rate_2s,
      'completion_rate_5s', completion_rate_5s,
      'avg_play_duration', avg_play_duration,
      'completion_rate', completion_rate
    ) order by id) filter (where snapshot_id is not null), '[]'::jsonb) as snapshots,
    count(*)::integer as returned_rows
  from enriched
)
select jsonb_build_object(
  'cursorValid', p_cursor is null or exists (
    select 1 from filtered f
    where f.id::text = p_cursor->>'id'
      and f.sort_value is not distinct from nullif(p_cursor->>'sortValue', '')::numeric
  ),
  'videos', result_page.videos,
  'snapshots', coalesce(result_page.snapshots, '[]'::jsonb),
  'accountOptions', (
    select coalesce(jsonb_agg(jsonb_build_object('id', account.id, 'name', account.name) order by account.name, account.id), '[]'::jsonb)
    from public.accounts account
    cross join args cfg
    where exists (
      select 1 from public.videos visible_video
      where visible_video.account_id = account.id
        and visible_video.lifecycle_state = cfg.lifecycle_state
        and coalesce(account.profile_id, visible_video.user_id) = any(coalesce(p_visible_user_ids, array[]::uuid[]))
    )
  ),
  'availableDates', (select coalesce(jsonb_agg(pub_date), '[]'::jsonb) from available_dates),
  -- 与 availableDates 同序同过滤的每日条数，形如 [{"d":"2026-10-22","c":15},...]
  'availableCounts', (select coalesce(jsonb_agg(jsonb_build_object('d', pub_date, 'c', video_count) order by pub_date desc), '[]'::jsonb) from available_dates),
  'summary', jsonb_build_object(
    'totalVideos', totals.total_count,
    'page', (select page from args),
    'pageSize', (select page_size from args),
    'totalPages', greatest(1, ceil(totals.total_count::numeric / (select page_size from args))::integer),
    'anomalyCount', totals.anomaly_count,
    'pageStartIndex', ((select page from args) - 1) * (select page_size from args),
    'hasPreviousPage', (select page from args) > 1,
    'hasNextPage', (select page from args) < greatest(1, ceil(totals.total_count::numeric / (select page_size from args))::integer),
    'directReviewVideoId', (select id::text from filtered where anomaly_bucket is not null order by review_priority desc, published_at desc nulls last, id asc limit 1)
  ),
  'diagnostics', jsonb_build_object(
    'evaluationStandardsVersion', 1,
    'rowsRead', (select count(*)::integer from base),
    'snapshotRowsRead', (select count(snapshot_id)::integer from base),
    'returnedRows', result_page.returned_rows
  ),
  'cursors', jsonb_build_object(
    'previous', case when (select page from args) > 1 and current_cursor.first_id is not null then jsonb_build_object('sortValue', current_cursor.first_value, 'id', current_cursor.first_id, 'direction', 'before') end,
    'next', case when (select page from args) < greatest(1, ceil(totals.total_count::numeric / (select page_size from args))::integer) and current_cursor.last_id is not null then jsonb_build_object('sortValue', current_cursor.last_value, 'id', current_cursor.last_id, 'direction', 'after') end
  )
)
from result_page
cross join totals
cross join current_cursor;
$$;

revoke all on function public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.admin_content_list_page(text, integer, integer, jsonb, text, text, uuid[], jsonb) to service_role;
