-- B3 第三批：补齐跨公司越权的两个缺口。
--
-- 结论来自本地 PG16 对照实测（同一脚手架下"应用前 / 应用后"各跑一次），
-- 不是按描述直接落 SQL。三条待办里只有两条有实际作用，见文末说明。
--
-- ===========================================================================
-- 1) teams 写边界（真实可利用，本次修复）
-- ===========================================================================
-- 证据：teams 的写策略只有 033 建的三条 permissive（"仅管理员写入/更新/删除团队"），
-- 谓词全是 public.is_admin()，不带公司范围；B3 第一/二批只给 teams 补了
-- SELECT 限制策略（b3_teams_select_active_actor、b3_teams_select_company_scope），
-- UPDATE 一直没有限制策略。
--
-- 实测基线：A 公司 admin 执行 `update public.teams set name = 'X'`（无 WHERE、
-- 无 RETURNING，等价于 `PATCH /rest/v1/teams` 无过滤请求）命中 2/2 行，
-- 即改到了 B 公司的团队行。因为 Postgres 只在语句需要读表时才套用 SELECT 策略，
-- 无 WHERE/无 RETURNING 的 UPDATE 不读表，所以既有的 SELECT 限制策略挡不住它。
-- 带 WHERE 的定向更新（PATCH /teams?id=eq.<uuid>）本来就已被 SELECT 限制策略
-- 挡住，这条策略补的是无过滤路径。
--
-- 谓词刻意不用 profiles.role：该列 CHECK 只有 ('member','admin','owner')，
-- 不存在 'company_owner' 取值，且自 20260819120000 起 company_role 才是权威列、
-- role 只是兼容投影。实测「actor.role in ('admin','company_owner')」会把
-- company_owner（其 role 实际为 'owner'）一并锁死：owner 改本公司团队命中 0 行。
-- 因此这里判定"同一公司"用 actor.team_id = teams.id，
-- 与 b3_teams_select_company_scope 写法一致；"是不是管理员"由既有 permissive
-- 策略（public.is_admin()）负责，RESTRICTIVE 只负责取交集。
--
-- 行为变化：team_id 为空的管理员将无法再更新任何 teams 行。当前应用没有使用
-- 用户会话更新 teams 的调用（建/删团队走 createAdminClient，全仓无 .update("teams")），
-- 因此不影响现有功能入口。

create policy b3_teams_update_company_scope on public.teams
  as restrictive for update to authenticated
  using (exists (select 1 from public.profiles actor
                 where actor.id = auth.uid()
                   and actor.membership_status = 'active'
                   and actor.team_id = teams.id))
  with check (exists (select 1 from public.profiles actor
                      where actor.id = auth.uid()
                        and actor.membership_status = 'active'
                        and actor.team_id = teams.id));

comment on policy b3_teams_update_company_scope on public.teams is
  'Restrict team updates to the actor own company (RESTRICTIVE, intersects with 仅管理员更新团队).';

-- ===========================================================================
-- 2) exemption_request 写边界（当前已被结构性拒绝，这里补显式护栏）
-- ===========================================================================
-- 实测：该表自 20260718113000 起就没有任何 permissive UPDATE 策略
-- （033 的 "仅管理员审核豁免申请" 已被 drop）。Postgres 语义是"没有 permissive
-- 策略即拒绝"，所以 authenticated 裸表 UPDATE 命中 0 行，跨公司审批已经不可能。
-- 实际审批入口是 security definer 的 review_exemption_request_dates_atomically，
-- 内部用 public.exemption_target_in_active_scope(...) 做公司校验并抛 42501
-- （前端映射 403），不依赖本表策略。
--
-- 那为什么还建：实测对照显示，一旦日后有人误加一条宽 UPDATE permissive 策略，
-- 当前"零策略"的隐式拒绝会立刻失效；补上这条 RESTRICTIVE 后，
-- 宽 permissive 也只能在本公司范围内生效。今天的授权结果不变，防的是回归。
-- 写路径用 active 版作用域（档案已归档的申请人不应再被改），与 B3 既有写策略一致。

create policy b3_exemption_request_update_active_scope on public.exemption_request
  as restrictive for update to authenticated
  using (applicant_user_id in (select user_id from public.active_visible_user_ids(auth.uid())))
  with check (applicant_user_id in (select user_id from public.active_visible_user_ids(auth.uid())));

comment on policy b3_exemption_request_update_active_scope on public.exemption_request is
  'Guard: exemption request updates stay in the actor active company scope if a permissive UPDATE policy is ever added.';

-- ===========================================================================
-- 3) exemption_grant SELECT —— 经核查已存在，本次不建
-- ===========================================================================
-- 20260916133825 已建 b3_exemption_grant_select_scope，
-- 谓词 user_id in (select user_id from public.visible_user_ids(auth.uid()))
-- 与待建策略逐字相同（同 cmd、同 to authenticated）。再建一条同义 RESTRICTIVE
-- 不改变任何授权结果，只会让策略面出现两条无法区分的同名义策略，审计时无法追溯。
-- 因此保留既有的那条，不重复建。
