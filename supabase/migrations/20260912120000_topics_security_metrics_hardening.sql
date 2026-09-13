-- Topics 全量安全与指标收口。
-- 团队边界只认 profiles.team_id；所有写操作经应用 API + service_role。

create schema if not exists private;

create or replace function private.is_active_topic_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.membership_status = 'active'
      and actor.team_id is not null
  )
$$;

create or replace function private.can_read_team_topic(p_sub_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.sub_topics st on st.id = p_sub_topic_id
    join public.profiles creator on creator.id = st.created_by
    where actor.id = (select auth.uid())
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and creator.team_id = actor.team_id
  )
$$;

create or replace function private.can_read_team_claim(p_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.sub_topic_claims claim on claim.id = p_claim_id
    join public.sub_topics st on st.id = claim.sub_topic_id
    join public.profiles creator on creator.id = st.created_by
    join public.profiles claimant on claimant.id = claim.user_id
    where actor.id = (select auth.uid())
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and st.library_status = 'in_library'
      and creator.team_id = actor.team_id
      and claimant.team_id = actor.team_id
  )
$$;

create or replace function private.can_read_team_actor(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = p_target_user_id
    where actor.id = (select auth.uid())
      and actor.membership_status = 'active'
      and actor.team_id is not null
      and target.team_id = actor.team_id
  )
$$;

revoke execute on function private.is_active_topic_member() from public;
revoke execute on function private.is_active_topic_member() from anon;
revoke execute on function private.can_read_team_topic(uuid) from public;
revoke execute on function private.can_read_team_topic(uuid) from anon;
revoke execute on function private.can_read_team_claim(uuid) from public;
revoke execute on function private.can_read_team_claim(uuid) from anon;
revoke execute on function private.can_read_team_actor(uuid) from public;
revoke execute on function private.can_read_team_actor(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_topic_member() to authenticated;
grant execute on function private.can_read_team_topic(uuid) to authenticated;
grant execute on function private.can_read_team_claim(uuid) to authenticated;
grant execute on function private.can_read_team_actor(uuid) to authenticated;

drop policy if exists "已登录用户读取母题" on public.topics;
drop policy if exists "已登录用户读取选题分组" on public.topic_groups;
drop policy if exists "已登录用户读取子题" on public.sub_topics;
drop policy if exists "已登录用户创建自己的子题" on public.sub_topics;
drop policy if exists "创建者或管理员更新子题" on public.sub_topics;
drop policy if exists "创建者或管理员删除子题" on public.sub_topics;
drop policy if exists "用户读取自己的认领" on public.sub_topic_claims;
drop policy if exists "用户创建自己的认领" on public.sub_topic_claims;
drop policy if exists "用户更新自己的认领" on public.sub_topic_claims;
drop policy if exists "用户删除自己的认领" on public.sub_topic_claims;
drop policy if exists "管理员写入导入批次" on public.topic_import_batches;
drop policy if exists "管理员读取导入批次" on public.topic_import_batches;
drop policy if exists "管理员管理母题" on public.topics;
drop policy if exists "管理员管理选题分组" on public.topic_groups;
drop policy if exists "有效团队成员读取母题" on public.topics;
drop policy if exists "有效团队成员读取选题分组" on public.topic_groups;
drop policy if exists "有效成员读取同团队子题" on public.sub_topics;
drop policy if exists "有效成员读取同团队认领" on public.sub_topic_claims;
drop policy if exists "有效管理员读取同团队导入批次" on public.topic_import_batches;

create policy "有效团队成员读取母题"
  on public.topics for select to authenticated
  using ((select private.is_active_topic_member()));

create policy "有效团队成员读取选题分组"
  on public.topic_groups for select to authenticated
  using ((select private.is_active_topic_member()));

create policy "有效成员读取同团队子题"
  on public.sub_topics for select to authenticated
  using (library_status = 'in_library' and (select private.can_read_team_topic(id)));

create policy "有效成员读取同团队认领"
  on public.sub_topic_claims for select to authenticated
  using ((select private.can_read_team_claim(id)));

create policy "有效管理员读取同团队导入批次"
  on public.topic_import_batches for select to authenticated
  using (public.is_admin() and (select private.can_read_team_actor(created_by)));

revoke insert, update, delete on table public.sub_topics from public;
revoke insert, update, delete on table public.sub_topics from anon;
revoke insert, update, delete on table public.sub_topics from authenticated;
revoke insert, update, delete on table public.sub_topic_claims from public;
revoke insert, update, delete on table public.sub_topic_claims from anon;
revoke insert, update, delete on table public.sub_topic_claims from authenticated;
revoke insert, update, delete on table public.topic_import_batches from public;
revoke insert, update, delete on table public.topic_import_batches from anon;
revoke insert, update, delete on table public.topic_import_batches from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.topics from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.topic_groups from public, anon, authenticated;
revoke truncate, references, trigger on table public.sub_topics from public, anon, authenticated;
revoke truncate, references, trigger on table public.sub_topic_claims from public, anon, authenticated;
revoke truncate, references, trigger on table public.topic_import_batches from public, anon, authenticated;

-- 先将历史状态归一；同一成员同一题若有多条旧有效状态，只保留最新一条 writing，
-- 其余转为 cancelled，保留全部 claim 记录。
drop index if exists public.sub_topic_claims_one_writing_per_user_topic;
drop index if exists public.sub_topic_claims_one_active_per_user_topic;
drop trigger if exists trg_sub_topic_claims_candidate_limit on public.sub_topic_claims;
drop function if exists public.enforce_candidate_claim_limit();

with ranked_legacy as (
  select
    id,
    row_number() over (
      partition by user_id, sub_topic_id
      order by claimed_at desc, id desc
    ) as active_rank
  from public.sub_topic_claims
  where status in ('candidate', 'scripting', 'writing')
)
update public.sub_topic_claims claims
set status = case when ranked_legacy.active_rank = 1 then 'writing' else 'cancelled' end,
    ended_at = case when ranked_legacy.active_rank = 1 then null else coalesce(claims.ended_at, now()) end
from ranked_legacy
where claims.id = ranked_legacy.id;

update public.sub_topic_claims
set status = 'cancelled', ended_at = coalesce(ended_at, returned_at, now())
where status = 'returned';

alter table public.sub_topic_claims
  drop constraint if exists sub_topic_claims_status_check;

alter table public.sub_topic_claims
  add constraint sub_topic_claims_status_check
  check (status in ('writing', 'cancelled', 'completed'));

create unique index if not exists sub_topic_claims_one_writing_per_user_topic
  on public.sub_topic_claims(user_id, sub_topic_id)
  where status = 'writing';

-- 旧签名必须移除，否则它仍会保留 PUBLIC 默认执行权。
drop function if exists public.topics_pool_aggregates(uuid[]);

create or replace function public.topics_pool_aggregates(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with team_members as (
  select p.id
  from public.profiles p
  where p.team_id = p_team_id
),
pool_topics as (
  select st.id
  from public.sub_topics st
  join public.profiles creator on creator.id = st.created_by
  where st.library_status = 'in_library'
    and creator.team_id = p_team_id
),
scoped_works as (
  select
    v.topic_id,
    v.content,
    v.uploaded_at,
    coalesce((
      select max(s.play_count)
      from public.video_metrics_snapshots s
      where s.video_id = v.id
    ), 0) as play_count
  from public.videos v
  join team_members member on member.id = v.user_id
  join pool_topics topic on topic.id = v.topic_id
  where v.lifecycle_state = 'active'
),
work_metrics as (
  select
    topic_id,
    count(*)::int as work_count,
    max(play_count) as internal_best_play,
    round(avg(play_count))::int as internal_avg_play,
    count(*) filter (where play_count >= 30000)::int as qualified_count,
    sum(play_count) filter (where play_count >= 30000)::bigint as qualified_play_total,
    max(uploaded_at) as latest_uploaded_at
  from scoped_works
  group by topic_id
),
best_copy as (
  select distinct on (topic_id) topic_id, content
  from scoped_works
  where play_count >= 30000
  order by topic_id, play_count desc, uploaded_at desc nulls last
),
latest_copy as (
  select distinct on (topic_id) topic_id, content
  from scoped_works
  where play_count >= 30000
  order by topic_id, uploaded_at desc nulls last
),
recent_works as (
  select v.topic_id, v.user_id
  from public.videos v
  join team_members member on member.id = v.user_id
  join pool_topics topic on topic.id = v.topic_id
  where v.lifecycle_state = 'active'
    and v.uploaded_at >= now() - interval '7 days'
),
recent_writing as (
  select c.sub_topic_id as topic_id, c.user_id
  from public.sub_topic_claims c
  join team_members member on member.id = c.user_id
  join pool_topics topic on topic.id = c.sub_topic_id
  where c.status = 'writing'
    and c.claimed_at >= now() - interval '7 days'
),
recent_users as (
  select topic_id, user_id, true as is_completed from recent_works
  union
  select topic_id, user_id, false as is_completed from recent_writing
),
heat as (
  select
    topic_id,
    count(distinct user_id) filter (where is_completed)::int as completed_count,
    count(distinct user_id) filter (where not is_completed)::int as in_progress_count,
    count(distinct user_id)::int as participants
  from recent_users
  group by topic_id
),
current_writing as (
  select c.sub_topic_id as topic_id, count(distinct c.user_id)::int as current_writing_count
  from public.sub_topic_claims c
  join team_members member on member.id = c.user_id
  join pool_topics topic on topic.id = c.sub_topic_id
  where c.status = 'writing'
  group by c.sub_topic_id
)
select coalesce(jsonb_object_agg(
  pt.id,
  jsonb_build_object(
    'workCount', coalesce(wm.work_count, 0),
    'internalBestPlay', wm.internal_best_play,
    'internalAvgPlay', wm.internal_avg_play,
    'qualifiedWorkCount', coalesce(wm.qualified_count, 0),
    'averagePlayCount', case
      when coalesce(wm.qualified_count, 0) > 0
        then round(wm.qualified_play_total::numeric / wm.qualified_count)::int
      else null
    end,
    'bestPlayCount', wm.internal_best_play,
    'bestCopy', bc.content,
    'latestCopy', lc.content,
    'latestUploadedAt', wm.latest_uploaded_at,
    'completedCount', coalesce(h.completed_count, 0),
    'inProgressCount', coalesce(h.in_progress_count, 0),
    'participants', coalesce(h.participants, 0),
    'currentWritingCount', coalesce(cw.current_writing_count, 0)
  )
), '{}'::jsonb)
from pool_topics pt
left join work_metrics wm on wm.topic_id = pt.id
left join best_copy bc on bc.topic_id = pt.id
left join latest_copy lc on lc.topic_id = pt.id
left join heat h on h.topic_id = pt.id
left join current_writing cw on cw.topic_id = pt.id
$$;

revoke execute on function public.topics_pool_aggregates(uuid) from public;
revoke execute on function public.topics_pool_aggregates(uuid) from anon;
revoke execute on function public.topics_pool_aggregates(uuid) from authenticated;
grant execute on function public.topics_pool_aggregates(uuid) to service_role;

create or replace function public.toggle_topic_library_atomic(
  p_sub_topic_id uuid,
  p_action text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.sub_topics%rowtype;
  updated public.sub_topics%rowtype;
  next_status text;
begin
  if p_action not in ('remove', 'restore') then
    raise exception 'invalid topic library action';
  end if;

  select * into existing
  from public.sub_topics
  where id = p_sub_topic_id
  for update;

  if not found then
    return null;
  end if;

  next_status := case when p_action = 'remove' then 'removed' else 'in_library' end;
  if existing.library_status = next_status then
    return jsonb_build_object(
      'id', existing.id,
      'title', existing.title,
      'library_status', existing.library_status,
      'removed_at', existing.removed_at,
      'removed_by', existing.removed_by
    );
  end if;

  update public.sub_topics
  set library_status = next_status,
      removed_at = case when p_action = 'remove' then now() else null end,
      removed_by = case when p_action = 'remove' then p_actor_id else null end
  where id = p_sub_topic_id
  returning * into updated;

  insert into public.audit_logs(user_id, action, target, detail)
  values (
    p_actor_id,
    case when p_action = 'remove' then 'topic_library_remove' else 'topic_library_restore' end,
    p_sub_topic_id::text,
    jsonb_build_object(
      'title', existing.title,
      'previous_status', existing.library_status,
      'next_status', next_status
    )::text
  );

  return jsonb_build_object(
    'id', updated.id,
    'title', updated.title,
    'library_status', updated.library_status,
    'removed_at', updated.removed_at,
    'removed_by', updated.removed_by
  );
end;
$$;

revoke execute on function public.toggle_topic_library_atomic(uuid, text, uuid) from public;
revoke execute on function public.toggle_topic_library_atomic(uuid, text, uuid) from anon;
revoke execute on function public.toggle_topic_library_atomic(uuid, text, uuid) from authenticated;
grant execute on function public.toggle_topic_library_atomic(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
