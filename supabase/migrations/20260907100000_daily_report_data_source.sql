alter table public.daily_reports
  add column if not exists data_source text
  check (data_source in ('ai', 'manual'));

comment on column public.daily_reports.data_source is
  'ai: recognized without manual edits; manual: manually entered or edited; null: unknown historical source';

create or replace function public.preserve_daily_report_manual_source()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.data_source = 'manual' then
    new.data_source := 'manual';
  end if;
  return new;
end;
$$;

create trigger preserve_daily_report_manual_source
before update of data_source on public.daily_reports
for each row execute function public.preserve_daily_report_manual_source();

-- Attribution changes and provenance are committed in the same transaction.
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

notify pgrst, 'reload schema';
