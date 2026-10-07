-- B3 第三批（独立后续）：限制 teams 删除只能落在当前 actor 所属公司。
--
-- 该迁移与 20260918100000 分开，便于单独受控上线和回滚验收。
-- 既有“仅管理员删除团队” permissive 策略负责管理员身份；
-- 本 restrictive 策略只负责取当前公司范围的交集。
-- 这里刻意不用 profiles.role = 'company_owner'：role 实际只有
-- member/admin/owner，owner 的公司身份由 company_role 表达。

drop policy if exists "b3_teams_delete_company_scope" on public.teams;
create policy b3_teams_delete_company_scope on public.teams
  as restrictive for delete to authenticated
  using (exists (select 1 from public.profiles actor
                 where actor.id = auth.uid()
                   and actor.membership_status = 'active'
                   and actor.team_id = teams.id));

comment on policy b3_teams_delete_company_scope on public.teams is
  'Restrict team deletes to the actor own company (RESTRICTIVE, intersects with 仅管理员删除团队).';
