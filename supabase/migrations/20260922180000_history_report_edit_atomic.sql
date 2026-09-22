-- 历史手稿编辑（HistoryReportEditForm → submitReport）的原子写入。
--
-- 与 public.update_collaboration_attribution 的差异（后者是协作补录专用，保持原样不动）：
--   1) 无绑定视频时只写日报，不再按 account_id + 日期猜一条视频写回去；
--   2) 不受协作统计起点 date '2026-07-27' 限制，覆盖历史手稿列表实际可见范围；
--   3) 覆盖日报全部可编辑字段（标题、正文、指标、发布时间），不只改三个负责人列；
--   4) 绑定视频校验失败时整笔回滚，不再留下「日报已保存、视频没同步」的半成功。
--
-- 归属与权限：本函数是 security definer 且绕过 RLS，只授予 service_role。
-- 调用方（Server Action submitReport）必须先完成登录、账号归属与可编辑范围校验，
-- 再以服务端身份调用；本函数不接受客户端直连。
--
-- 三岗位口径：p_touch_assignees = false 表示调用方未提交这三个字段（保留原值），
-- true 表示调用方明确提交（此时 uuid 为 null 就是「明确清空」）。

create or replace function public.update_history_report_edit_atomic(
  p_report_id uuid,
  p_actor_id uuid,
  p_video_id uuid,
  p_title text,
  p_content text,
  p_published_at timestamptz,
  p_uploaded_at timestamptz,
  p_submitter text,
  p_play_count integer,
  p_likes integer,
  p_comments integer,
  p_shares integer,
  p_favorites integer,
  p_follower_gain integer,
  p_follower_convert integer,
  p_completion_rate text,
  p_avg_play_duration text,
  p_bounce_rate_2s text,
  p_completion_rate_5s text,
  p_script_author_user_id uuid,
  p_video_editor_user_id uuid,
  p_operator_user_id uuid,
  p_touch_assignees boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_report public.daily_reports%rowtype;
begin
  if p_report_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = '历史日报编辑参数不完整';
  end if;

  -- 先锁日报行：后续校验与两次写入都在同一事务的同一把锁下完成
  select * into v_report
  from public.daily_reports
  where id = p_report_id
  for update;

  if v_report.id is null then
    raise exception using errcode = 'P0002', message = '日报不存在';
  end if;

  if v_report.is_void then
    raise exception using errcode = 'P0001', message = '该日报已作废，不能编辑';
  end if;

  if v_report.user_id <> p_actor_id then
    raise exception using errcode = '42501', message = '无权编辑该日报';
  end if;

  -- p_video_id 必须与日报的直接绑定完全一致：null 只代表合法日报-only，
  -- 绝不允许客户端带一个猜出来的视频覆盖日报。
  if p_video_id is distinct from v_report.video_id then
    raise exception using errcode = '22023', message = '日报与绑定视频不一致';
  end if;

  update public.daily_reports
  set title = p_title,
      content = p_content,
      published_at = p_published_at,
      uploaded_at = coalesce(p_uploaded_at, uploaded_at),
      submitter = coalesce(p_submitter, submitter),
      play_count = p_play_count,
      likes = p_likes,
      comments = p_comments,
      shares = p_shares,
      favorites = p_favorites,
      follower_gain = p_follower_gain,
      follower_convert = p_follower_convert,
      completion_rate = p_completion_rate,
      avg_play_duration = p_avg_play_duration,
      bounce_rate_2s = p_bounce_rate_2s,
      completion_rate_5s = p_completion_rate_5s,
      script_author_user_id = case
        when p_touch_assignees then p_script_author_user_id else script_author_user_id end,
      video_editor_user_id = case
        when p_touch_assignees then p_video_editor_user_id else video_editor_user_id end,
      operator_user_id = case
        when p_touch_assignees then p_operator_user_id else operator_user_id end
  where id = v_report.id;

  -- 无绑定视频：只写日报，不猜视频、不新建绑定
  if p_video_id is null then
    return jsonb_build_object('reportId', v_report.id, 'videoUpdated', false);
  end if;

  update public.videos
  set video_title = p_title,
      content = p_content,
      script_author_user_id = case
        when p_touch_assignees then p_script_author_user_id else script_author_user_id end,
      video_editor_user_id = case
        when p_touch_assignees then p_video_editor_user_id else video_editor_user_id end,
      operator_user_id = case
        when p_touch_assignees then p_operator_user_id else operator_user_id end
  where id = p_video_id
    and account_id = v_report.account_id
    and lifecycle_state = 'active';

  if not found then
    raise exception using errcode = 'P0001', message = '绑定视频不存在或不可编辑';
  end if;

  return jsonb_build_object('reportId', v_report.id, 'videoUpdated', true);
end;
$$;

revoke all on function public.update_history_report_edit_atomic(
  uuid, uuid, uuid, text, text, timestamptz, timestamptz, text,
  integer, integer, integer, integer, integer, integer, integer,
  text, text, text, text, uuid, uuid, uuid, boolean
) from public, anon, authenticated;

grant execute on function public.update_history_report_edit_atomic(
  uuid, uuid, uuid, text, text, timestamptz, timestamptz, text,
  integer, integer, integer, integer, integer, integer, integer,
  text, text, text, text, uuid, uuid, uuid, boolean
) to service_role;

-- PostgREST 需要重载 schema cache 才能看到新函数。
notify pgrst, 'reload schema';
