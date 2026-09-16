-- B3: intersect existing permissive policies with the active actor's
-- default company scope. No client supplied group-mode or team parameter is
-- accepted here. Group-mode RLS needs a separate trusted server contract.
-- Restrictive policies preserve existing business permissions while closing
-- the cross-team OR branches of the current permissive policies.

create policy b3_profiles_select_scope on public.profiles
  as restrictive for select to authenticated
  using (id in (select user_id from public.visible_user_ids(auth.uid())));

create policy b3_accounts_select_scope on public.accounts
  as restrictive for select to authenticated
  using (profile_id in (select user_id from public.visible_user_ids(auth.uid())));
create policy b3_accounts_insert_scope on public.accounts
  as restrictive for insert to authenticated
  with check (
    profile_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = profile_id and target.membership_status = 'active')
  );
create policy b3_accounts_update_scope on public.accounts
  as restrictive for update to authenticated
  using (
    profile_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = profile_id and target.membership_status = 'active')
  )
  with check (
    profile_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = profile_id and target.membership_status = 'active')
  );
create policy b3_accounts_delete_scope on public.accounts
  as restrictive for delete to authenticated
  using (
    profile_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = profile_id and target.membership_status = 'active')
  );

create policy b3_daily_reports_select_scope on public.daily_reports
  as restrictive for select to authenticated
  using (user_id in (select user_id from public.visible_user_ids(auth.uid())));
create policy b3_daily_reports_insert_scope on public.daily_reports
  as restrictive for insert to authenticated
  with check (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  );
create policy b3_daily_reports_update_scope on public.daily_reports
  as restrictive for update to authenticated
  using (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  )
  with check (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  );
create policy b3_daily_reports_delete_scope on public.daily_reports
  as restrictive for delete to authenticated
  using (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  );

create policy b3_videos_select_scope on public.videos
  as restrictive for select to authenticated
  using (user_id in (select user_id from public.visible_user_ids(auth.uid())));
create policy b3_videos_insert_scope on public.videos
  as restrictive for insert to authenticated
  with check (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  );
create policy b3_videos_update_scope on public.videos
  as restrictive for update to authenticated
  using (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  )
  with check (
    user_id in (select user_id from public.visible_user_ids(auth.uid()))
    and exists (select 1 from public.profiles target
                where target.id = user_id and target.membership_status = 'active')
    and exists (select 1 from public.accounts account
                where account.id = account_id and account.profile_id = user_id)
  );

create policy b3_exemption_request_select_scope on public.exemption_request
  as restrictive for select to authenticated
  using (applicant_user_id in (select user_id from public.visible_user_ids(auth.uid())));
create policy b3_exemption_request_insert_scope on public.exemption_request
  as restrictive for insert to authenticated
  with check (
    applicant_user_id = auth.uid()
    and (profile_id is null or profile_id = auth.uid())
    and exists (select 1 from public.profiles actor
                where actor.id = auth.uid()
                  and actor.membership_status = 'active'
                  and actor.team_id = team_id)
  );
create policy b3_exemption_request_delete_scope on public.exemption_request
  as restrictive for delete to authenticated
  using (applicant_user_id = auth.uid()
         and auth.uid() in (select user_id from public.visible_user_ids(auth.uid())));

create policy b3_exemption_grant_select_scope on public.exemption_grant
  as restrictive for select to authenticated
  using (user_id in (select user_id from public.visible_user_ids(auth.uid())));

-- Team names are used as a join-request directory. Preserve that read path,
-- but block archived actors with still-valid access tokens.
create policy b3_teams_select_active_actor on public.teams
  as restrictive for select to authenticated
  using (auth.uid() in (select user_id from public.visible_user_ids(auth.uid())));

create policy b3_ai_input_bundle_select_active_actor on public.ai_input_bundle
  as restrictive for select to authenticated
  using (auth.uid() in (select user_id from public.visible_user_ids(auth.uid())));
