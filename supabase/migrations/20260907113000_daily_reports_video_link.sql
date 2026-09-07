begin;

alter table public.daily_reports
  add column if not exists video_id uuid references public.videos(id) on delete set null,
  add column if not exists voided_by_video_id uuid references public.videos(id) on delete set null,
  add column if not exists voided_actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_reason text,
  add column if not exists voided_previous_review_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_reports_voided_previous_review_status_check'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_voided_previous_review_status_check
      check (voided_previous_review_status is null or voided_previous_review_status in ('pending', 'confirmed', 'needs_changes', 'void'));
  end if;
end $$;

drop index if exists public.daily_reports_account_id_report_date_key;

create unique index if not exists daily_reports_account_id_report_date_active_key
  on public.daily_reports (account_id, report_date)
  where is_void = false;

-- 只约束未作废日报与视频的一对一绑定；trash 作废的历史行保留 video_id 供审计与恢复，
-- 重传同指纹内容（video_id 相同）时新日报插入不得被作废旧行挡住。
create unique index if not exists daily_reports_video_id_key
  on public.daily_reports (video_id)
  where video_id is not null and is_void = false;

create index if not exists idx_daily_reports_video_id
  on public.daily_reports (video_id)
  where video_id is not null;

create index if not exists idx_daily_reports_voided_by_video_id
  on public.daily_reports (voided_by_video_id)
  where voided_by_video_id is not null;

comment on column public.daily_reports.video_id is
  'Direct source video for the daily report. New submissions write this; historical rows may be null and keep date fallback.';
comment on column public.daily_reports.voided_by_video_id is
  'Video lifecycle action that voided this report, used to restore only reversible trash-side effects.';
comment on column public.daily_reports.voided_previous_review_status is
  'Review status before lifecycle voiding, restored when the linked video is restored.';

create or replace function public.transition_video_lifecycle_with_report_link(
  p_video_id uuid,
  p_action text,
  p_actor_id uuid,
  p_restore_reports boolean default true
)
returns table (
  id uuid,
  lifecycle_state text,
  trashed_at timestamptz,
  purged_at timestamptz,
  daily_reports_changed integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  transitioned record;
  changed_count integer := 0;
begin
  select * into transitioned
  from public.transition_video_lifecycle(p_video_id, p_action, p_actor_id);

  if transitioned.id is null then
    return;
  end if;

  if p_action = 'trash' then
    update public.daily_reports
      set is_void = true,
          review_status = 'void',
          voided_by_video_id = p_video_id,
          voided_actor_id = p_actor_id,
          voided_at = now(),
          voided_reason = 'video_lifecycle_trash',
          voided_previous_review_status = review_status
      where video_id = p_video_id
        and is_void = false;
    get diagnostics changed_count = row_count;
  elsif p_action = 'restore' and p_restore_reports then
    -- 只恢复最近一次作废的那条：同一视频可能因“作废→重传→再作废”积累多条作废旧行，
    -- 全部复活会撞 video_id 唯一索引；最近一条才是当前有效提交的承载行。
    update public.daily_reports
      set is_void = false,
          review_status = coalesce(voided_previous_review_status, 'pending'),
          voided_by_video_id = null,
          voided_actor_id = null,
          voided_at = null,
          voided_reason = null,
          voided_previous_review_status = null
      where id = (
        select dr.id
        from public.daily_reports dr
        where dr.video_id = p_video_id
          and dr.is_void = true
          and dr.voided_by_video_id = p_video_id
          and dr.voided_reason = 'video_lifecycle_trash'
        order by dr.voided_at desc nulls last, dr.created_at desc
        limit 1
      );
    get diagnostics changed_count = row_count;
  elsif p_action = 'purge' then
    update public.daily_reports
      set is_void = true,
          review_status = 'void',
          voided_by_video_id = p_video_id,
          voided_actor_id = p_actor_id,
          voided_at = coalesce(voided_at, now()),
          voided_reason = coalesce(voided_reason, 'video_lifecycle_purge'),
          voided_previous_review_status = coalesce(voided_previous_review_status, review_status)
      where video_id = p_video_id
        and is_void = false;
    get diagnostics changed_count = row_count;
  end if;

  return query select
    transitioned.id,
    transitioned.lifecycle_state,
    transitioned.trashed_at,
    transitioned.purged_at,
    changed_count;
end;
$$;

revoke all on function public.transition_video_lifecycle_with_report_link(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.transition_video_lifecycle_with_report_link(uuid, text, uuid, boolean)
  to service_role;

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

  if v_report.video_id is not null then
    select id into v_video_id
    from public.videos
    where id = v_report.video_id
      and lifecycle_state = 'active'
    for update;
  end if;

  if v_video_id is null then
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

revoke all on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_collaboration_attribution(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
