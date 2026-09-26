-- Correct the correlated name resolution in the first B3 migration.
-- Compare the request row's team_id with the active actor's trusted profile.
--
-- [重放修复 2026-09-27] 与 20260916133825 同源：exemption_request.profile_id 在线上存在，
--   但迁移史里没有为该表加此列的语句，空库重放到本步时该列不存在，原文报 42703。
--   处置：按列是否存在二选一重建该策略（语义与原文一致，仅去掉/保留 profile_id 条件）。
--   用 drop-if-exists + create 而非 alter policy：PostgreSQL 的 CREATE POLICY 既不支持
--   OR REPLACE 也不支持 IF NOT EXISTS，且 alter 在上一条策略因守卫未建时会报
--   "policy does not exist"，改成幂等重建更稳。
do $repair_20260916134053$
begin
  execute $ddl$
    drop policy if exists b3_exemption_request_insert_scope on public.exemption_request;
  $ddl$;

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
          and team_id = (
            select actor.team_id
            from public.profiles actor
            where actor.id = auth.uid()
              and actor.membership_status = 'active'
          )
        );
    $ddl$;
  else
    execute $ddl$
      create policy b3_exemption_request_insert_scope on public.exemption_request
        as restrictive for insert to authenticated
        with check (
          applicant_user_id = auth.uid()
          and team_id = (
            select actor.team_id
            from public.profiles actor
            where actor.id = auth.uid()
              and actor.membership_status = 'active'
          )
        );
    $ddl$;
  end if;
end$repair_20260916134053$;
