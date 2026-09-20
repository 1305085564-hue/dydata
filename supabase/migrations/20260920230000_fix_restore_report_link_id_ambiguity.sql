begin;

-- 修复：restore 分支 `where id = (select dr.id ...)` 中的裸 `id`
-- 与函数 OUT 参数 id 歧义（SQLSTATE 42702），导致恢复回收站作品必然失败。
-- 改为限定列名 public.daily_reports.id，其余逻辑保持不变。
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
      where public.daily_reports.id = (
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

notify pgrst, 'reload schema';

commit;
