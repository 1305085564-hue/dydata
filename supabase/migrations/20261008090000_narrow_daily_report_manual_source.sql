-- 日报来源只反映指标是否被人工录入或修改。
-- 协作归属补录不再改变 data_source；归属是统计元数据，不是指标来源。

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
  is '协作归属补录：原子更新日报署名；不改变日报指标来源标记。';

revoke all on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
