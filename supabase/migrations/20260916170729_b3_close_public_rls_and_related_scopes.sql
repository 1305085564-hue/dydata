-- B3 second batch. This migration follows the two already-applied 20260916
-- company-scope migrations. Ordinary Data API requests remain company-scoped;
-- trusted cross-company group mode is resolved in the server application.

-- These five legacy tables were exposed with RLS disabled and full anon grants.
-- Their current live schema is not the old 019-023 migration schema. No
-- application write path requires direct authenticated access to these tables.
alter table public.content_history enable row level security;
alter table public.content_item enable row level security;
alter table public.field_provenance enable row level security;
alter table public.script_segment enable row level security;
alter table public.submission_batch enable row level security;

revoke all on table public.content_history from public, anon, authenticated;
revoke all on table public.content_item from public, anon, authenticated;
revoke all on table public.field_provenance from public, anon, authenticated;
revoke all on table public.script_segment from public, anon, authenticated;
revoke all on table public.submission_batch from public, anon, authenticated;

-- The growth loader still probes these two legacy tables using columns absent
-- in production. Preserve SELECT parsing (and its known missing-column
-- fallback), while RLS prevents direct access to any script_segment rows.
grant select on table public.content_item, public.script_segment to authenticated;
create policy b3_content_item_select_own_active on public.content_item
  for select to authenticated
  using (
    owner = auth.uid()
    and exists (select 1 from public.profiles actor
                where actor.id = auth.uid()
                  and actor.membership_status = 'active')
  );

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
