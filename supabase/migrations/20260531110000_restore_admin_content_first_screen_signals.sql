-- ============================================================
-- restore admin_content_first_screen play-change signals
-- 目标：通过新增 migration 正式更新线上 RPC，恢复批改台首屏的涨跌信号
-- 边界：不改旧 migration，只覆盖 admin_content_first_screen 函数
-- ============================================================

create or replace function public.admin_content_first_screen(
  p_visible_user_ids uuid[],
  p_view text default 'pending',
  p_limit_rows int default 30,
  p_candidate_limit int default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_view text := case when p_view = 'all' then 'all' else 'pending' end;
  normalized_limit int := greatest(1, least(coalesce(p_limit_rows, 30), 100));
  normalized_candidate_limit int := greatest(normalized_limit, least(coalesce(p_candidate_limit, 60), 200));
begin
  if p_visible_user_ids is null or array_length(p_visible_user_ids, 1) is null then
    return jsonb_build_object(
      'videos', '[]'::jsonb,
      'snapshots', '[]'::jsonb,
      'profiles', '[]'::jsonb,
      'accounts', '[]'::jsonb,
      'reviewedVideoIds', '[]'::jsonb,
      'feedbackCards', '{}'::jsonb,
      'reviewReadiness', '{}'::jsonb,
      'summary', jsonb_build_object(
        'totalVideos', 0,
        'reviewedCount', 0,
        'snapshotCount', 0,
        'pendingReviewCount', 0
      ),
      'workflowSummary', jsonb_build_object(
        'notStarted', 0,
        'draft', 0,
        'confirmed', 0,
        'sent', 0,
        'viewed', 0,
        'pendingDelivery', 0
      ),
      'isPartial', false
    );
  end if;

  return (
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
      left join public.accounts a on a.id = v.account_id
      left join public.profiles p on p.id = v.user_id
      where coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)
    ),
    reviewed_ids as (
      select distinct (air.result_json ->> 'video_id') as video_id
      from public.ai_insight_result air
      where air.insight_type = 'next_day_review'
        and air.result_status = 'success'
        and (air.result_json ->> 'video_id') in (select id::text from scoped_videos)
    ),
    scoped_with_flags as (
      select
        sv.*,
        exists (select 1 from reviewed_ids r where r.video_id = sv.id::text) as is_reviewed
      from scoped_videos sv
    ),
    candidate_videos as (
      select *
      from scoped_with_flags
      where normalized_view = 'all' or is_reviewed = false
      order by coalesce(published_at, created_at) desc, created_at desc
      limit normalized_candidate_limit
    ),
    visible_videos as (
      select *
      from candidate_videos
      order by coalesce(published_at, created_at) desc, created_at desc
      limit normalized_limit
    ),
    visible_ids as (
      select id from visible_videos
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
    account_previous_boundary as (
      select
        vv.account_id,
        min(vv.published_at) as oldest_visible_published_at
      from visible_videos vv
      where vv.account_id is not null
        and vv.published_at is not null
      group by vv.account_id
    ),
    previous_boundary_videos as (
      select distinct on (v.account_id)
        v.id,
        v.account_id,
        v.published_at
      from public.videos v
      join account_previous_boundary apb
        on apb.account_id = v.account_id
      where v.published_at is not null
        and v.published_at < apb.oldest_visible_published_at
      order by v.account_id, v.published_at desc
    ),
    previous_candidates as (
      select vv.id, vv.account_id, vv.published_at
      from visible_videos vv
      where vv.account_id is not null
        and vv.published_at is not null
      union all
      select pbv.id, pbv.account_id, pbv.published_at
      from previous_boundary_videos pbv
    ),
    previous_video_links as (
      select
        vv.id as visible_video_id,
        (
          select pc.id
          from previous_candidates pc
          where pc.account_id = vv.account_id
            and pc.id <> vv.id
            and pc.published_at < vv.published_at
          order by pc.published_at desc
          limit 1
        ) as previous_video_id
      from visible_videos vv
      where vv.account_id is not null
        and vv.published_at is not null
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
    visible_segments as (
      select distinct vcs.video_id
      from public.video_content_segments vcs
      where vcs.video_id in (select id from visible_ids)
    ),
    visible_feedback_cards as (
      select
        cfc.id,
        cfc.video_id,
        cfc.card_status,
        cfc.manager_note,
        cfc.draft_payload,
        cfc.draft_generated_at,
        cfc.confirmed_at,
        cfc.sent_at,
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
                when ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 >= 100 then 'surge'
                when ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 <= -50 then 'halve'
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
          order by ls.captured_at desc
        )
        from latest_snapshots ls
      ), '[]'::jsonb),
      'profiles',
      coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.name, '未命名成员')) order by p.name asc)
        from public.profiles p
        where p.id in (select profile_id from visible_profile_ids)
      ), '[]'::jsonb),
      'accounts',
      coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'name', coalesce(a.name, '未命名账号')) order by a.name asc)
        from public.accounts a
        where a.profile_id in (select profile_id from visible_profile_ids)
      ), '[]'::jsonb),
      'reviewedVideoIds',
      coalesce((select jsonb_agg(r.video_id) from reviewed_ids r), '[]'::jsonb),
      'feedbackCards',
      coalesce((
        select jsonb_object_agg(
          vv.id::text,
          jsonb_build_object(
            'card_id', cfc.id,
            'video_id', vv.id,
            'workflow_status', coalesce(cfc.card_status, 'not_started'),
            'workflow_label',
              case coalesce(cfc.card_status, 'not_started')
                when 'draft' then 'AI初稿待确认'
                when 'confirmed' then '已确认待下发'
                when 'sent' then '已下发待查看'
                when 'viewed' then '员工已查看'
                else '未生成'
              end,
            'has_ai_draft', (cfc.draft_payload is not null),
            'latest_draft_at', cfc.draft_generated_at,
            'confirmed_at', cfc.confirmed_at,
            'sent_at', cfc.sent_at,
            'viewed_at', cfc.viewed_at,
            'manager_note', cfc.manager_note
          )
        )
        from visible_videos vv
        left join visible_feedback_cards cfc on cfc.video_id = vv.id
      ), '{}'::jsonb),
      'reviewReadiness',
      coalesce((
        select jsonb_object_agg(
          vv.id::text,
          jsonb_build_object(
            'video_id', vv.id,
            'status',
              case
                when coalesce(cfc.card_status, 'not_started') <> 'not_started' then cfc.card_status
                when ls.video_id is null then 'missing_snapshot'
                when coalesce(nullif(btrim(vv.content), ''), '') = '' then 'missing_content'
                when vs.video_id is null then 'missing_segments'
                else 'ready'
              end,
            'label',
              case
                when coalesce(cfc.card_status, 'not_started') = 'draft' then 'AI初稿待确认'
                when coalesce(cfc.card_status, 'not_started') = 'confirmed' then '已确认待下发'
                when coalesce(cfc.card_status, 'not_started') = 'sent' then '已下发待查看'
                when coalesce(cfc.card_status, 'not_started') = 'viewed' then '员工已查看'
                when ls.video_id is null then '缺24h截图'
                when coalesce(nullif(btrim(vv.content), ''), '') = '' then '缺文案'
                when vs.video_id is null then '待切片'
                else '可生成'
              end,
            'can_generate',
              (
                coalesce(cfc.card_status, 'not_started') = 'not_started'
                and ls.video_id is not null
                and coalesce(nullif(btrim(vv.content), ''), '') <> ''
                and vs.video_id is not null
              ),
            'has_snapshot_24h', (ls.video_id is not null),
            'has_segments', (vs.video_id is not null)
          )
        )
        from visible_videos vv
        left join latest_snapshots ls on ls.video_id = vv.id
        left join visible_segments vs on vs.video_id = vv.id
        left join visible_feedback_cards cfc on cfc.video_id = vv.id
      ), '{}'::jsonb),
      'summary',
      jsonb_build_object(
        'totalVideos', (select count(*)::int from scoped_with_flags),
        'reviewedCount', (select count(*)::int from reviewed_ids),
        'snapshotCount', (select count(*)::int from latest_snapshots),
        'pendingReviewCount', (select count(*)::int from scoped_with_flags where is_reviewed = false)
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
      (
        select case when count(*) > normalized_limit then true else false end
        from candidate_videos
      )
    )
  );
end;
$$;
