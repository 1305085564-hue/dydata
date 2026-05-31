-- sync admin_content_first_screen signal thresholds with TS loader
-- 规则：暴涨看“翻倍且绝对增量 >= 5000”；腰斩看“跌幅 <= -50% 且当前播放仍 >= 5000”

create or replace function public.admin_content_first_screen(
  p_visible_user_ids uuid[],
  p_view text default 'pending',
  p_limit_rows integer default 20,
  p_candidate_limit integer default 60
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with scoped_videos as (
    select
      v.id,
      v.account_id,
      v.user_id,
      v.video_url,
      v.video_title,
      v.content,
      v.published_at,
      v.uploaded_at,
      v.anomaly_status,
      v.created_at,
      a.name as account_name,
      a.profile_id as owner_profile_id,
      p.name as profile_name
    from public.videos v
    join public.accounts a on a.id = v.account_id
    join public.profiles p on p.id = v.user_id
    where coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)
  ),
  reviewed_ids as (
    select distinct (air.result_json ->> 'video_id')::uuid as video_id
    from public.ai_insight_result air
    where air.insight_type = 'next_day_review'
      and air.result_status = 'success'
      and air.result_json ? 'video_id'
  ),
  candidate_videos as (
    select
      sv.*,
      exists(select 1 from reviewed_ids rid where rid.video_id = sv.id) as is_reviewed
    from scoped_videos sv
    order by coalesce(sv.published_at, sv.created_at) desc, sv.created_at desc
    limit greatest(coalesce(p_candidate_limit, 60), coalesce(p_limit_rows, 20))
  ),
  pending_videos as (
    select *
    from candidate_videos
    where not is_reviewed
  ),
  visible_videos as (
    select *
    from (
      select *
      from pending_videos
      where coalesce(p_view, 'pending') = 'pending'
      union all
      select *
      from candidate_videos
      where coalesce(p_view, 'pending') <> 'pending'
    ) rows
    order by coalesce(published_at, created_at) desc, created_at desc
    limit greatest(coalesce(p_limit_rows, 20), 1)
  ),
  visible_ids as (
    select id
    from visible_videos
  ),
  latest_snapshots as (
    select distinct on (s.video_id)
      s.id,
      s.video_id,
      s.snapshot_type,
      s.captured_at,
      s.play_count,
      s.bounce_rate_2s,
      s.completion_rate_5s,
      s.completion_rate,
      s.avg_play_duration,
      s.follower_gain,
      s.likes,
      s.comments,
      s.shares,
      s.favorites,
      s.screenshot_urls,
      s.curve_screenshot_url,
      s.retention_screenshot_url
    from public.video_metrics_snapshots s
    where s.snapshot_type = '24h'
      and s.video_id in (select id from visible_ids)
    order by s.video_id, s.captured_at desc
  ),
  relevant_candidates as (
    select sv.*
    from scoped_videos sv
    where sv.account_id in (
      select distinct account_id
      from visible_videos
      where account_id is not null
    )
      and sv.published_at is not null
  ),
  previous_boundary_videos as (
    select distinct on (vv.id)
      vv.id as visible_video_id,
      prev.id as previous_video_id
    from visible_videos vv
    join lateral (
      select rv.id, rv.published_at
      from relevant_candidates rv
      where rv.account_id = vv.account_id
        and rv.id <> vv.id
        and rv.published_at < vv.published_at
      order by rv.published_at desc
      limit 1
    ) prev on true
  ),
  previous_video_links as (
    select
      vv.id as visible_video_id,
      pbc.previous_video_id
    from visible_videos vv
    left join previous_boundary_videos pbc on pbc.visible_video_id = vv.id
  ),
  previous_latest_snapshots as (
    select distinct on (s.video_id)
      s.video_id,
      s.play_count,
      s.captured_at
    from public.video_metrics_snapshots s
    where s.snapshot_type = '24h'
      and s.video_id in (
        select previous_video_id
        from previous_video_links
        where previous_video_id is not null
      )
    order by s.video_id, s.captured_at desc
  ),
  scoped_with_flags as (
    select
      sv.id,
      exists(select 1 from latest_snapshots ls where ls.video_id = sv.id) as has_snapshot_24h,
      exists(select 1 from public.video_content_segments vcs where vcs.video_id = sv.id) as has_segments
    from scoped_videos sv
  ),
  feedback_rows as (
    select
      cfc.video_id,
      cfc.card_status,
      cfc.confirmed_at,
      cfc.delivered_at,
      cfc.viewed_at
    from public.content_feedback_cards cfc
    where cfc.video_id in (select id from visible_ids)
  ),
  workflow_counts as (
    select
      count(*) filter (where coalesce(cfc.card_status, 'not_started') = 'not_started')::int as not_started_count,
      count(*) filter (where cfc.card_status = 'draft')::int as draft_count,
      count(*) filter (where cfc.card_status = 'confirmed')::int as confirmed_count,
      count(*) filter (where cfc.card_status = 'sent')::int as sent_count,
      count(*) filter (where cfc.card_status = 'viewed')::int as viewed_count
    from scoped_with_flags sv
    left join public.content_feedback_cards cfc on cfc.video_id = sv.id
  ),
  visible_profile_ids as (
    select distinct coalesce(owner_profile_id, user_id) as profile_id
    from scoped_videos
  )
  select jsonb_build_object(
    'videos',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vv.id,
          'account_id', vv.account_id,
          'user_id', vv.user_id,
          'video_url', vv.video_url,
          'video_title', vv.video_title,
          'content', vv.content,
          'published_at', vv.published_at,
          'uploaded_at', vv.uploaded_at,
          'anomaly_status', vv.anomaly_status,
          'created_at', vv.created_at,
          'previous_play_count', pls.play_count,
          'play_count_change_pct',
            case
              when ls.play_count is null or pls.play_count is null or pls.play_count <= 0 then null
              else ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100
            end,
          'play_change_signal',
            case
              when ls.play_count is null or pls.play_count is null or pls.play_count <= 0 then null
              when (ls.play_count - pls.play_count) >= 5000
                and ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 >= 100 then 'surge'
              when ls.play_count >= 5000
                and ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 <= -50 then 'halve'
              else null
            end,
          'accounts', jsonb_build_object('name', coalesce(vv.account_name, '未命名账号')),
          'profiles', jsonb_build_object('name', coalesce(vv.profile_name, '未命名成员'))
        )
        order by coalesce(vv.published_at, vv.created_at) desc, vv.created_at desc
      )
      from visible_videos vv
      left join latest_snapshots ls on ls.video_id = vv.id
      left join previous_video_links pvl on pvl.visible_video_id = vv.id
      left join previous_latest_snapshots pls on pls.video_id = pvl.previous_video_id
    ), '[]'::jsonb),
    'snapshots',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ls.id,
          'video_id', ls.video_id,
          'snapshot_type', ls.snapshot_type,
          'captured_at', ls.captured_at,
          'play_count', ls.play_count,
          'bounce_rate_2s', ls.bounce_rate_2s,
          'completion_rate_5s', ls.completion_rate_5s,
          'completion_rate', ls.completion_rate,
          'avg_play_duration', ls.avg_play_duration,
          'follower_gain', ls.follower_gain,
          'likes', ls.likes,
          'comments', ls.comments,
          'shares', ls.shares,
          'favorites', ls.favorites,
          'screenshot_urls', ls.screenshot_urls,
          'curve_screenshot_url', ls.curve_screenshot_url,
          'retention_screenshot_url', ls.retention_screenshot_url
        )
      )
      from latest_snapshots ls
    ), '[]'::jsonb),
    'profiles',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', coalesce(p.name, '未命名成员')
        )
        order by p.name asc
      )
      from public.profiles p
      where p.id in (select profile_id from visible_profile_ids)
    ), '[]'::jsonb),
    'accounts',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', coalesce(a.name, '未命名账号'),
          'profile_id', a.profile_id
        )
        order by a.name asc
      )
      from public.accounts a
      where a.profile_id in (select profile_id from visible_profile_ids)
    ), '[]'::jsonb),
    'reviewedVideoIds',
    coalesce((
      select jsonb_agg(rid.video_id)
      from reviewed_ids rid
      where rid.video_id in (select id from scoped_videos)
    ), '[]'::jsonb),
    'feedbackCards',
    coalesce((
      select jsonb_object_agg(
        cfc.video_id::text,
        jsonb_build_object(
          'video_id', cfc.video_id,
          'workflow_status', coalesce(cfc.card_status, 'not_started'),
          'workflow_label',
            case coalesce(cfc.card_status, 'not_started')
              when 'draft' then '草稿待确认'
              when 'confirmed' then '已确认未发'
              when 'sent' then '已下发'
              when 'viewed' then '员工已读'
              else '未开始'
            end,
          'confirmed_at', cfc.confirmed_at,
          'delivered_at', cfc.delivered_at,
          'viewed_at', cfc.viewed_at
        )
      )
      from feedback_rows cfc
    ), '{}'::jsonb),
    'reviewReadiness',
    coalesce((
      select jsonb_object_agg(
        sv.id::text,
        jsonb_build_object(
          'status',
            case
              when coalesce(fr.card_status, 'not_started') <> 'not_started' then 'ready'
              when not sv.has_snapshot_24h then 'missing_snapshot'
              when not sv.has_segments then 'missing_segments'
              when coalesce(vv.content, '') = '' then 'missing_content'
              else 'ready'
            end,
          'label',
            case
              when coalesce(fr.card_status, 'not_started') <> 'not_started' then '已生成'
              when not sv.has_snapshot_24h then '缺24h快照'
              when not sv.has_segments then '缺拆段'
              when coalesce(vv.content, '') = '' then '缺文案'
              else '可生成'
            end,
          'can_generate',
            (coalesce(fr.card_status, 'not_started') = 'not_started')
            and sv.has_snapshot_24h
            and sv.has_segments
            and coalesce(vv.content, '') <> '',
          'has_snapshot_24h', sv.has_snapshot_24h,
          'has_segments', sv.has_segments
        )
      )
      from scoped_with_flags sv
      join visible_videos vv on vv.id = sv.id
      left join feedback_rows fr on fr.video_id = sv.id
      where sv.id in (select id from visible_ids)
    ), '{}'::jsonb),
    'summary',
    jsonb_build_object(
      'totalVideos', (select count(*)::int from scoped_videos),
      'reviewedCount', (select count(*)::int from reviewed_ids rid where rid.video_id in (select id from scoped_videos)),
      'snapshotCount', (select count(*)::int from scoped_with_flags swf where swf.has_snapshot_24h),
      'pendingReviewCount', (select count(*)::int from pending_videos)
    ),
    'workflowSummary',
    (
      select jsonb_build_object(
        'notStarted', wc.not_started_count,
        'draft', wc.draft_count,
        'confirmed', wc.confirmed_count,
        'sent', wc.sent_count,
        'viewed', wc.viewed_count,
        'pendingDelivery', wc.draft_count + wc.confirmed_count
      )
      from workflow_counts wc
    ),
    'isPartial',
    ((select count(*) from (
      select *
      from pending_videos
      where coalesce(p_view, 'pending') = 'pending'
      union all
      select *
      from candidate_videos
      where coalesce(p_view, 'pending') <> 'pending'
    ) rows) > greatest(coalesce(p_limit_rows, 20), 1))
  );
$$;
