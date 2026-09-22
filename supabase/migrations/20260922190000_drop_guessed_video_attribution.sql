-- 协作归属补录 RPC：去掉「日报没绑定视频时，按账号 + 业务日期猜一条 active 视频」的兜底。
--
-- 病根（与读侧同一处，只是活在写侧）：
--   读侧 src/app/api/video-submit/edit-detail 曾经按「账号 + 业务日期」猜视频，命中唯一一条时
--   会把归属写到**另一条作品**上（本批 20260922180000 已修）。写侧的这段兜底完全同构：
--   日报没有 video_id 时，取同账号同业务日期 published_at/uploaded_at 最新的那条 active 视频，
--   把三个署名列覆盖上去 —— 于是同一份署名被写到一条无关的作品上，两表就此分叉。
--
-- 改后口径：
--   只同步「日报自己绑定的那条 active 视频」。日报未绑定时不碰任何视频，
--   沿用既有返回契约 videoUpdated = false（src/app/api/admin/collaboration/handlers.ts
--   本来就有「暂未匹配到视频」的提示分支，所以这是设计内的合法状态，不是新增故障态）。
--
-- 保持不变：2026-07-27 统计起点、for update 行锁、data_source 置 manual 的判定规则、
--           security definer + search_path、只授权 service_role。

create or replace function public.update_collaboration_attribution(
  p_report_id uuid,
  p_script_author_user_id uuid,
  p_video_editor_user_id uuid,
  p_operator_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_report public.daily_reports%rowtype;
  v_video_id uuid;
begin
  select * into v_report
  from public.daily_reports
  where id = p_report_id
    and report_date >= date '2026-07-27'
  for update;

  if v_report.id is null then
    raise exception using errcode = 'P0002', message = '日报不存在或早于协作统计起点';
  end if;

  update public.daily_reports
  set script_author_user_id = p_script_author_user_id,
      video_editor_user_id = p_video_editor_user_id,
      operator_user_id = p_operator_user_id,
      data_source = case when
        (v_report.script_author_user_id, v_report.video_editor_user_id, v_report.operator_user_id)
        is distinct from
        (p_script_author_user_id, p_video_editor_user_id, p_operator_user_id)
        then 'manual' else v_report.data_source end
  where id = v_report.id;

  -- 只认日报自己绑定的视频；不再按账号/日期猜测其它作品。
  if v_report.video_id is not null then
    select id into v_video_id
    from public.videos
    where id = v_report.video_id
      and lifecycle_state = 'active'
    for update;
  end if;

  if v_video_id is not null then
    update public.videos
    set script_author_user_id = p_script_author_user_id,
        video_editor_user_id = p_video_editor_user_id,
        operator_user_id = p_operator_user_id
    where id = v_video_id;
  end if;

  return jsonb_build_object('videoUpdated', v_video_id is not null);
end;
$$;

comment on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  is '协作归属补录：原子更新日报署名；仅在日报已绑定 active 视频时同步视频署名，不再按账号+日期猜测视频。';

revoke all on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
