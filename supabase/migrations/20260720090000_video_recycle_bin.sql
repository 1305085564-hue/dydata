-- 作品回收站：保留 videos 主键与所有复盘/审计关联，禁止物理删除。
alter table public.videos
  add column if not exists lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'trashed', 'purged')),
  add column if not exists trashed_at timestamptz,
  add column if not exists trashed_by uuid references public.profiles(id) on delete set null,
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_videos_active_uploaded_at
  on public.videos (uploaded_at desc, created_at desc)
  where lifecycle_state = 'active';

create index if not exists idx_videos_trashed_at
  on public.videos (trashed_at desc, created_at desc)
  where lifecycle_state = 'trashed';

-- 前台直连数据库时也不能读出回收或墓碑作品；后台回收站由 service_role 接口读取。
drop policy if exists "员工看自己的视频" on public.videos;
create policy "员工看自己的视频" on public.videos
  for select using (user_id = auth.uid() and lifecycle_state = 'active');

drop policy if exists "管理员看全部视频" on public.videos;
create policy "管理员看全部视频" on public.videos
  for select using (
    lifecycle_state = 'active'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "员工更新自己的视频" on public.videos;
create policy "员工更新自己的活跃视频" on public.videos
  for update using (user_id = auth.uid() and lifecycle_state = 'active')
  with check (user_id = auth.uid() and lifecycle_state = 'active');

-- 旧的 FOR ALL 会给浏览器端 DELETE 权限；改成仅允许编辑 active 作品。
drop policy if exists "管理员管理全部视频" on public.videos;
create policy "管理员更新活跃视频" on public.videos
  for update using (
    lifecycle_state = 'active'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  )
  with check (
    lifecycle_state = 'active'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

-- 由服务端在完成应用层鉴权和范围校验后调用；状态变更与审计日志在同一事务内提交。
create or replace function public.transition_video_lifecycle(
  p_video_id uuid,
  p_action text,
  p_actor_id uuid
)
returns table (
  id uuid,
  lifecycle_state text,
  trashed_at timestamptz,
  purged_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_state text;
  audit_action text;
  updated_video public.videos%rowtype;
begin
  if p_action = 'trash' then
    next_state := 'trashed';
    audit_action := 'video_trashed';
    update public.videos
      set lifecycle_state = next_state,
          trashed_at = now(),
          trashed_by = p_actor_id,
          purged_at = null,
          purged_by = null
      where videos.id = p_video_id
        and videos.lifecycle_state = 'active'
      returning * into updated_video;
  elsif p_action = 'restore' then
    next_state := 'active';
    audit_action := 'video_restored';
    update public.videos
      set lifecycle_state = next_state,
          trashed_at = null,
          trashed_by = null
      where videos.id = p_video_id
        and videos.lifecycle_state = 'trashed'
      returning * into updated_video;
  elsif p_action = 'purge' then
    next_state := 'purged';
    audit_action := 'video_purged';
    update public.videos
      set lifecycle_state = next_state,
          purged_at = now(),
          purged_by = p_actor_id
      where videos.id = p_video_id
        and videos.lifecycle_state = 'trashed'
        and videos.trashed_at <= now() - interval '30 days'
      returning * into updated_video;
  else
    raise exception 'unsupported video lifecycle action: %', p_action using errcode = '22023';
  end if;

  if updated_video.id is null then
    return;
  end if;

  insert into public.audit_logs (user_id, action, target, detail)
  values (
    p_actor_id,
    audit_action,
    updated_video.id::text,
    jsonb_build_object(
      'video_id', updated_video.id,
      'lifecycle_state', next_state,
      'trashed_at', updated_video.trashed_at,
      'purged_at', updated_video.purged_at
    )::text
  );

  return query select updated_video.id, updated_video.lifecycle_state, updated_video.trashed_at, updated_video.purged_at;
end;
$$;

revoke all on function public.transition_video_lifecycle(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.transition_video_lifecycle(uuid, text, uuid) to service_role;

-- 视频提交失败时的受限回滚：只回收当前用户刚创建的 active 作品。
-- 有关联历史时转入回收站，避免级联删除复盘/快照；无关联时才物理删除。
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
    union all select 1 from public.content_feedback_cards where video_id = target.id
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

-- 首屏 RPC 使用 security definer，应用层筛选不会作用到它。沿用远端当前定义并只注入 active 条件，
-- 这样不会修改历史 migration，也不会因手抄长函数而丢失既有首屏字段。
do $$
declare
  function_name regprocedure;
  definition text;
  updated_definition text;
begin
  foreach function_name in array array[
    'public.admin_content_first_screen(uuid[],text,integer,integer)'::regprocedure,
    'public.admin_videos_first_screen(uuid[],text,integer,integer)'::regprocedure
  ] loop
    definition := pg_get_functiondef(function_name);
    updated_definition := replace(
      definition,
      'where coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)',
      'where v.lifecycle_state = ''active'' and coalesce(a.profile_id, v.user_id) = any(p_visible_user_ids)'
    );
    if updated_definition = definition then
      raise exception 'unable to inject active lifecycle filter into %', function_name;
    end if;
    execute updated_definition;
  end loop;
end;
$$;

-- work_submissions 是已归档产量凭证，任何应用角色都不能删。
drop policy if exists "成员删除自己的作品提交" on public.work_submissions;
revoke delete on public.work_submissions from authenticated;
