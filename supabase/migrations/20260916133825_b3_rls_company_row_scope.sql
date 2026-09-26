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
-- [重放修复 2026-09-27] exemption_request.profile_id 在线上存在（已只读核对），但**全仓迁移里
--   没有任何为该表加此列的语句**（唯一命中是 member_change_log.profile_id，不是本表）。
--   空库重放到本步时该列不存在，原文直接报 42703 并中断整条重放。
--   处置：按列是否存在二选一 —— 列存在时按原文逐字建策略；列不存在时退化为不含该条件的
--   等价策略（仍保留申请人与团队归属两道约束），避免本地环境完全没有 insert 限制。
do $repair_20260916133825$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exemption_request'
      and column_name = 'profile_id'
  ) then
    execute $ddl$
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
    $ddl$;
  else
    execute $ddl$
      create policy b3_exemption_request_insert_scope on public.exemption_request
        as restrictive for insert to authenticated
        with check (
          applicant_user_id = auth.uid()
          and exists (select 1 from public.profiles actor
                      where actor.id = auth.uid()
                        and actor.membership_status = 'active'
                        and actor.team_id = team_id)
        );
    $ddl$;
  end if;
end$repair_20260916133825$;
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
