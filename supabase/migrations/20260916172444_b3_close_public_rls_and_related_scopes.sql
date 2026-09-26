-- B3 second batch. This migration follows the two already-applied 20260916
-- company-scope migrations. Ordinary Data API requests remain company-scoped;
-- trusted cross-company group mode is resolved in the server application.

-- These five legacy tables were exposed with RLS disabled and full anon grants.
-- Their current live schema is not the old 019-023 migration schema. No
-- application write path requires direct authenticated access to these tables.
-- [重放修复 2026-09-27] public.content_history 在线上存在（已只读核对），但**全仓迁移里
--   没有任何建表语句** —— 它是线上手工建的。空库重放到本步时表不存在，`ALTER TABLE` /
--   `REVOKE` 都会报 42P01 并中断整条重放。处置：把它从下面两批里单独摘出加存在性守卫，
--   表存在时按原文执行（线上行为一字不变），不存在时跳过；其余四张表维持原文不动。
do $repair_20260916172444$
begin
  if to_regclass('public.content_history') is null then
    raise notice '20260916172444: public.content_history 不存在（迁移史中无建表语句），跳过该表的 RLS 收口';
    return;
  end if;

  execute $ddl$
    alter table public.content_history enable row level security;
  $ddl$;

  execute $ddl$
    revoke all on table public.content_history from public, anon, authenticated;
  $ddl$;
end$repair_20260916172444$;

alter table public.content_item enable row level security;
alter table public.field_provenance enable row level security;
alter table public.script_segment enable row level security;
alter table public.submission_batch enable row level security;

revoke all on table public.content_item from public, anon, authenticated;
revoke all on table public.field_provenance from public, anon, authenticated;
revoke all on table public.script_segment from public, anon, authenticated;
revoke all on table public.submission_batch from public, anon, authenticated;

-- The growth loader still probes these two legacy tables using columns absent
-- in production. Preserve SELECT parsing (and its known missing-column
-- fallback), while RLS prevents direct access to any script_segment rows.
grant select on table public.content_item, public.script_segment to authenticated;

-- [重放修复 2026-09-27] 线上 public.content_item 是手工建的另一套 schema
--   （列：id / owner / title / body / created_at / is_published / summary），而本仓 020
--   建的是 owner_user_id —— 本文件开头的注释已自述 "current live schema is not the old
--   019-023 migration schema"。空库重放到本步时 `owner` 列不存在，原文报 42703。
--   处置：按列是否存在二选一。有 owner（线上现状）用原文；退回 owner_user_id 时用语义等价的
--   "自己那一行"判定；两者都没有则跳过并告警。
do $repair_20260916172444_content_item$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_item' and column_name = 'owner'
  ) then
    execute $ddl$
      create policy b3_content_item_select_own_active on public.content_item
        for select to authenticated
        using (
          owner = auth.uid()
          and exists (select 1 from public.profiles actor
                      where actor.id = auth.uid()
                        and actor.membership_status = 'active')
        );
    $ddl$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_item' and column_name = 'owner_user_id'
  ) then
    execute $ddl$
      create policy b3_content_item_select_own_active on public.content_item
        for select to authenticated
        using (
          owner_user_id = auth.uid()
          and exists (select 1 from public.profiles actor
                      where actor.id = auth.uid()
                        and actor.membership_status = 'active')
        );
    $ddl$;
  else
    raise notice '20260916172444: content_item 既无 owner 也无 owner_user_id，跳过 b3_content_item_select_own_active';
  end if;
end$repair_20260916172444_content_item$;

-- Team names remain available through the deliberately public, server-side
-- /api/register-teams id/name directory. Direct table reads stay in-company.
create policy b3_teams_select_company_scope on public.teams
  as restrictive for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid()
                   and p.team_id = teams.id
                   and p.membership_status = 'active'));

-- Applicants can view/cancel their own pending request before being assigned
-- a company. An admin may read requests for their own company only.
create policy b3_team_join_requests_select_scope on public.team_join_requests
  as restrictive for select to authenticated
  using (exists (select 1 from public.profiles actor
                 where actor.id = auth.uid()
                   and actor.membership_status = 'active'
                   and (applicant_user_id = auth.uid()
                        or (public.is_admin() and target_team_id = actor.team_id))));
create policy b3_team_join_requests_insert_active on public.team_join_requests
  as restrictive for insert to authenticated
  with check (applicant_user_id = auth.uid()
              and exists (select 1 from public.profiles actor
                          where actor.id = auth.uid()
                            and actor.membership_status = 'active'));
create policy b3_team_join_requests_delete_active on public.team_join_requests
  as restrictive for delete to authenticated
  using (applicant_user_id = auth.uid()
         and exists (select 1 from public.profiles actor
                     where actor.id = auth.uid()
                       and actor.membership_status = 'active'));

-- Existing permissive video-child policies include actor-only admin branches.
-- Intersect every action with the parent's visible current-company scope;
-- current writes use active members and UPDATE checks both old/new video_id.
create policy b3_video_content_segments_select_scope on public.video_content_segments
  as restrictive for select to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.visible_user_ids(auth.uid()))));
create policy b3_video_content_segments_insert_scope on public.video_content_segments
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.videos v
                     where v.id = video_id
                       and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_content_segments_update_scope on public.video_content_segments
  as restrictive for update to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))))
  with check (exists (select 1 from public.videos v
                      where v.id = video_id
                        and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_content_segments_delete_scope on public.video_content_segments
  as restrictive for delete to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));

create policy b3_video_metrics_snapshots_select_scope on public.video_metrics_snapshots
  as restrictive for select to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.visible_user_ids(auth.uid()))));
create policy b3_video_metrics_snapshots_insert_scope on public.video_metrics_snapshots
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.videos v
                     where v.id = video_id
                       and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_metrics_snapshots_update_scope on public.video_metrics_snapshots
  as restrictive for update to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))))
  with check (exists (select 1 from public.videos v
                      where v.id = video_id
                        and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_metrics_snapshots_delete_scope on public.video_metrics_snapshots
  as restrictive for delete to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));

create policy b3_video_tags_select_scope on public.video_tags
  as restrictive for select to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.visible_user_ids(auth.uid()))));
create policy b3_video_tags_insert_scope on public.video_tags
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.videos v
                     where v.id = video_id
                       and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_tags_update_scope on public.video_tags
  as restrictive for update to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))))
  with check (exists (select 1 from public.videos v
                      where v.id = video_id
                        and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));
create policy b3_video_tags_delete_scope on public.video_tags
  as restrictive for delete to authenticated
  using (exists (select 1 from public.videos v
                 where v.id = video_id
                   and v.user_id in (select user_id from public.active_visible_user_ids(auth.uid()))));

-- The exemption_request_date SELECT/INSERT policies both query the parent
-- exemption_request table as the invoker. Its existing B3 restrictive policies
-- already filter archived actors and cross-company parent rows; no duplicate
-- child policy is needed without evidence of a reachable bypass.

-- Keep the helper's caller contract for authenticated self-owned reports,
-- while removing anonymous/PUBLIC execution and mutable-schema name lookup.
create or replace function public.owns_account(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.accounts account
    where account.id = target_account_id
      and account.profile_id = auth.uid()
  );
$$;
revoke all on function public.owns_account(uuid) from public, anon;
grant execute on function public.owns_account(uuid) to authenticated, service_role;
