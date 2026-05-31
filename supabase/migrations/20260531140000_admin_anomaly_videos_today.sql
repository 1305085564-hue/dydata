-- 管理端首页「异常视频」卡 RPC
-- 口径与 20260531123000_sync_admin_content_first_screen_signal_thresholds.sql 中的 admin_content_first_screen 保持一致：
-- surge（暴涨）= 当前24h播放较上一条视频24h播放绝对增量 >= 5000 且涨跌幅 >= 100%
-- halve（腰斩）= 当前24h播放 >= 5000 且涨跌幅 <= -50%
-- 上一条视频 = 同 account_id 下 published_at 严格早于当前视频的最近一条；比较口径只看两条视频各自最新的 24h 快照 play_count

create or replace function public.admin_anomaly_videos_today(
  p_visible_user_ids uuid[],
  target_date date,
  limit_rows integer default 10
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
      v.video_title,
      v.published_at,
      v.created_at,
      a.name as account_name,
      a.profile_id as owner_profile_id,
      p.name as profile_name
    from public.videos v
    left join public.accounts a on a.id = v.account_id
    left join public.profiles p on p.id = v.user_id
    where p_visible_user_ids is null
       or coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)
  ),
  visible_videos as (
    select *
    from scoped_videos
    where published_at is not null
      and (published_at at time zone 'Asia/Shanghai')::date = target_date
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
      s.play_count
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
  signal_rows as (
    select
      vv.id,
      vv.account_id,
      coalesce(vv.account_name, '未命名账号') as account_name,
      vv.video_title,
      vv.published_at,
      vv.user_id as submitted_by,
      coalesce(vv.profile_name, '未命名成员') as submitted_by_name,
      case
        when ls.play_count is null or pls.play_count is null or pls.play_count <= 0 then null
        else ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100
      end as play_count_change_pct,
      ls.play_count as current_play_count,
      pls.play_count as previous_play_count,
      case
        when ls.play_count is null or pls.play_count is null or pls.play_count <= 0 then null
        when (ls.play_count - pls.play_count) >= 5000
          and ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 >= 100 then 'surge'
        when ls.play_count >= 5000
          and ((ls.play_count - pls.play_count)::numeric / pls.play_count::numeric) * 100 <= -50 then 'halve'
        else null
      end as play_change_signal
    from visible_videos vv
    left join latest_snapshots ls on ls.video_id = vv.id
    left join previous_video_links pvl on pvl.visible_video_id = vv.id
    left join previous_latest_snapshots pls on pls.video_id = pvl.previous_video_id
  ),
  ranked_rows as (
    select *
    from signal_rows
    where play_change_signal is not null
    order by abs(play_count_change_pct) desc, published_at desc, id asc
    limit greatest(coalesce(limit_rows, 10), 1)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rr.id,
        'account_id', rr.account_id,
        'account_name', rr.account_name,
        'video_title', rr.video_title,
        'published_at', rr.published_at,
        'submitted_by', rr.submitted_by,
        'submitted_by_name', rr.submitted_by_name,
        'play_change_signal', rr.play_change_signal,
        'play_count_change_pct', rr.play_count_change_pct,
        'current_play_count', rr.current_play_count,
        'previous_play_count', rr.previous_play_count
      )
      order by abs(rr.play_count_change_pct) desc, rr.published_at desc, rr.id asc
    ),
    '[]'::jsonb
  )
  from ranked_rows rr;
$$;
