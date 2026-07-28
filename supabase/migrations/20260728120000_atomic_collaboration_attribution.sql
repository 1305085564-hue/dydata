-- 协作归属补录必须让日报与对应活跃视频在同一数据库事务内保持一致。
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
      operator_user_id = p_operator_user_id
  where id = v_report.id;

  select id into v_video_id
  from public.videos
  where account_id = v_report.account_id
    and lifecycle_state = 'active'
    and (
      timezone('Asia/Shanghai', published_at)::date = v_report.report_date
      or timezone('Asia/Shanghai', uploaded_at)::date = v_report.report_date
    )
  order by coalesce(published_at, uploaded_at) desc nulls last, id
  limit 1
  for update;

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

revoke all on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  to service_role;
