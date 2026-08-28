-- 反馈闭环数据库清理：保留视频复盘内部分析与视频资产生命周期，删除反馈投递/回复/任务/经验沉淀。

begin;

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
    where v.lifecycle_state = 'active'
      and coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)
  ),
  analyzed_ids as (
    select distinct (air.result_json ->> 'video_id')::uuid as video_id
    from public.ai_insight_result air
    where air.insight_type = 'content_analysis'
      and air.result_status = 'success'
      and air.result_json ? 'video_id'
  ),
  candidate_videos as (
    select
      sv.*,
      exists(select 1 from analyzed_ids aid where aid.video_id = sv.id) as is_analyzed
    from scoped_videos sv
    order by coalesce(sv.uploaded_at, sv.created_at) desc, sv.created_at desc
    limit greatest(coalesce(p_candidate_limit, 60), coalesce(p_limit_rows, 20))
  ),
  pending_videos as (
    select *
    from candidate_videos
    where not is_analyzed
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
    order by coalesce(uploaded_at, created_at) desc, created_at desc
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
        order by coalesce(vv.uploaded_at, vv.created_at) desc, vv.created_at desc
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
    'reviewReadiness',
    coalesce((
      select jsonb_object_agg(
        sv.id::text,
        jsonb_build_object(
          'status',
            case
              when not sv.has_snapshot_24h then 'missing_snapshot'
              when coalesce(vv.content, '') = '' then 'missing_content'
              when not sv.has_segments then 'missing_segments'
              when exists(select 1 from analyzed_ids aid where aid.video_id = sv.id) then 'analyzed'
              else 'ready'
            end,
          'label',
            case
              when not sv.has_snapshot_24h then '缺24h快照'
              when coalesce(vv.content, '') = '' then '缺文案'
              when not sv.has_segments then '缺拆段'
              when exists(select 1 from analyzed_ids aid where aid.video_id = sv.id) then '已有分析'
              else '可分析'
            end,
          'can_generate',
            sv.has_snapshot_24h
            and coalesce(vv.content, '') <> '',
          'has_snapshot_24h', sv.has_snapshot_24h,
          'has_segments', sv.has_segments,
          'has_analysis', exists(select 1 from analyzed_ids aid where aid.video_id = sv.id)
        )
      )
      from scoped_with_flags sv
      join visible_videos vv on vv.id = sv.id
      where sv.id in (select id from visible_ids)
    ), '{}'::jsonb),
    'summary',
    jsonb_build_object(
      'totalVideos', (select count(*)::int from scoped_videos),
      'analyzedCount', (select count(*)::int from analyzed_ids aid where aid.video_id in (select id from scoped_videos)),
      'snapshotCount', (select count(*)::int from scoped_with_flags swf where swf.has_snapshot_24h),
      'pendingReviewCount', (select count(*)::int from pending_videos)
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

-- 回收保护：提交失败时仍以快照、标签和内容拆段决定回收或物理删除。
create or replace function public.rollback_new_video_submission(
  p_video_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.videos%rowtype;
  has_history boolean;
begin
  select * into target
  from public.videos
  where id = p_video_id
    and user_id = p_user_id
    and lifecycle_state = 'active'
    and created_at >= now() - interval '15 minutes'
  for update;

  if target.id is null then
    return 'missing_or_unsafe';
  end if;

  select exists (
    select 1 from public.video_metrics_snapshots where video_id = target.id
    union all select 1 from public.video_tags where video_id = target.id
    union all select 1 from public.video_content_segments where video_id = target.id
  ) into has_history;

  if has_history then
    update public.videos
      set lifecycle_state = 'trashed', trashed_at = now(), trashed_by = p_user_id
      where id = target.id;
    return 'trashed';
  end if;

  delete from public.videos where id = target.id;
  return 'deleted';
end;
$$;

revoke all on function public.rollback_new_video_submission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rollback_new_video_submission(uuid, uuid) to service_role;

-- 先卸载反馈任务与回复函数；表删除会一并移除其 RLS 策略和索引。
drop trigger if exists trg_sync_feedback_action_tasks on public.content_feedback_cards;
drop trigger if exists trg_content_feedback_cards_updated_at on public.content_feedback_cards;
drop trigger if exists trg_content_experience_marks_updated_at on public.content_experience_marks;

drop function if exists public.trg_sync_feedback_action_tasks();
drop function if exists public.sync_feedback_action_tasks(uuid);
drop function if exists public.submit_feedback_card_reply(uuid, uuid, text, text);

-- 先删除引用反馈卡的经验标记和子表，再删除反馈卡；不使用 CASCADE，防止误伤非反馈资产。
drop table if exists public.content_experience_marks;
drop table if exists public.feedback_action_tasks;
drop table if exists public.feedback_card_replies;
drop table if exists public.content_feedback_cards;

commit;
