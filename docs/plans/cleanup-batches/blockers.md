# DYData 清理前置阻断项解决方案

**来源**：`/private/tmp/dydata-full-cleanup-scan-2026-09-19.md` §2  
**编写日期**：2026-09-19  
**范围**：只处理 BLK-1 到 BLK-6 的解除条件；本文件不执行生产 SQL、不修改现有 migration、不删除清理候选。  
**总停止点**：六项均完成核验、留存证据并由确认人签字前，禁止执行任何清理批次。

---

## BLK-4 · 现有未提交改动可能改变判断

### 问题描述

扫描报告记录的是 31 项未提交改动，但当前工作树在本次文档写入前实际有 **65 项**。其中既有权限 / RLS 在途代码，也有未跟踪 migration、文档删除和其他会改变 `rg` / 调用链判断的改动。清理前如果不冻结边界，容易把别人正在改的代码误判为死代码。

### 影响范围

- `src/lib/team-join/service.ts` 与测试仍在途，不能在清理批次中重构或删除。
- B3 / cross-company 权限 migration 和测试会改变线上权限判断，必须先明确是否落地。
- 现有大量权限、成员生命周期、团队管理代码变更会改变引用链、角色语义和测试结论。
- 文档删除和新增文档会让扫描报告与当前工作树不一致；不能用 2026-09-19 扫描报告里的 31 项当作当前唯一清单。

### 当前未提交改动清单（本文件写入前快照）

以下清单来自当时的 `git status --short`；本文件本身是本任务新增，不纳入下面的前置在途判断。

**已修改（M）**

```text
docs/plans/2026-09-15-权限架构改造施工方案-激进版.md
docs/plans/2026-09-16-项目可维护性提升规划进度书.md
docs/待办清单.md
docs/权限与安全说明.md
src/app/(app)/admin/actions.ts
src/app/(app)/admin/modules/modules-content-v3.tsx
src/app/(app)/admin/modules/modules-permission-entry.test.ts
src/app/(app)/admin/modules/team-view-logic.test.ts
src/app/(app)/admin/modules/team-view-logic.ts
src/app/api/export/route.ts
src/app/api/group-mode/_shared.ts
src/app/api/group-mode/group-mode.test.ts
src/app/api/permission-requests/apply/route.test.ts
src/app/api/permission-requests/apply/route.ts
src/lib/admin-modules-contract.test.ts
src/lib/admin-modules-contract.ts
src/lib/admin-tools/user-management.ts
src/lib/company-permissions.test.ts
src/lib/company-permissions.ts
src/lib/conversion-hub/service.test.ts
src/lib/conversion-hub/service.ts
src/lib/current-permission-context.test.ts
src/lib/current-permission-context.ts
src/lib/data-access-scope.test.ts
src/lib/data-access-scope.ts
src/lib/group-mode-server.ts
src/lib/loaders/admin-modules.ts
src/lib/member-lifecycle-service.test.ts
src/lib/member-lifecycle-service.ts
src/lib/member-lifecycle.test.ts
src/lib/member-lifecycle.ts
src/lib/team-join/service.test.ts
src/lib/team-join/service.ts
src/lib/team-management.test.ts
src/lib/team-management.ts
src/lib/video-lifecycle.ts
src/lib/writer-certifications.test.ts
src/lib/writer-certifications.ts
日志/2026-09-15.md
日志/2026-09-16.md
日志/2026-09-17.md
```

**已删除（D）**

```text
docs/ux-audit-2026-09-12-岗位管理.md
docs/ux-audit-2026-09-12.md
docs/ux-audit-2026-09-14-dashboard.md
docs/ux-audit-2026-09-14-member-management.md
docs/ux-audit-2026-09-14-岗位管理.md
docs/ux-audit-2026-09-14-视频复盘.md
docs/ux-audit-2026-09-14.md
docs/ux-audit-consolidated-2026-09-13.md
```

**未跟踪（??）**

```text
docs/plans/2026-09-15-权限架构改造施工方案-最终版.md
docs/plans/2026-09-16-架构债务地图.md
docs/plans/2026-09-17-三角色简化方案-修正版.md
docs/plans/2026-09-17-权限架构改造第4步最终审查合并报告.md
docs/plans/2026-09-19-代码清理长期计划书-基于扫描报告.md
docs/plans/系统可维护性提升.md
docs/reference/权限RLS漂移对照-2026-09-18.md
docs/reference/权限系统现状核查-2026-09-18.md
src/lib/b3-database-boundary-migration.test.ts
supabase/migrations/20260916133825_b3_rls_company_row_scope.sql
supabase/migrations/20260916134053_b3_fix_exemption_request_insert_team_scope.sql
supabase/migrations/20260918100000_fix_cross_company_permissions.sql
supabase/migrations/20260919095135_permission_v2_reconcile_compat.sql
复盘-2026-09-17.md
思想-哲学-思考与反思.md
日志/2026-09-18.md
```

### 解决步骤（可执行）

1. 保存当前状态证据，禁止使用 `git reset --hard`、`git checkout --` 或未经授权的 `git stash`：

   ```bash
   git status --short
   git status --short | wc -l
   git diff --stat
   git diff -- supabase/migrations src/lib/team-join src/lib/team-management src/app/api/group-mode
   git ls-files --others --exclude-standard
   ```

2. 由在途改动负责人逐项标记每个文件：`落地后纳入扫描`、`冻结但保留`、`明确废弃`。其中至少要先处理：

   - `src/lib/team-join/service.ts` 与 `src/lib/team-join/service.test.ts`；
   - `src/lib/b3-database-boundary-migration.test.ts`；
   - 4 个未跟踪权限 migration：`20260916133825`、`20260916134053`、`20260918100000`、`20260919095135`；
   - 与权限模型同步的 `company-permissions`、`current-permission-context`、`data-access-scope`、`group-mode`、`member-lifecycle`、`team-management` 文件。

3. 若决定落地，先完成这些在途改动自己的测试和 review，再重新生成扫描基线；若决定冻结，写明冻结 commit / 文件清单，不得在清理批次中改同一文件。

4. 冻结后重新采集：

   ```bash
   git status --short
   rg -n -i 'b3|cross-company|company_role|group_mode|team-join|member-lifecycle' src supabase/migrations docs
   ```

5. 清理任务只允许引用冻结后的新基线；本文件的 65 项快照不能替代冻结确认。

### 验证方法

- `git status --short | wc -l` 的结果与负责人签字的清单一致。
- 权限 / RLS 在途 migration 已明确“已落地”或“冻结未落地”，没有处于未知状态的文件。
- 重新扫描时，清理候选的引用链不再依赖未提交文件是否偶然存在。
- 清理批次不会修改在途文件；若发现同文件冲突，立即停止该批次。

### 确认人

当前在途改动负责人 + 阿禅（确认冻结或落定边界）。

---

## BLK-1 · 线上 RLS/权限与 repo 迁移链不可互为可信源

### 问题描述

生产库存在 RLS、policy、函数和 migration 账本漂移。仓库里的 migration 只能代表“曾经设计过什么”，不能代表线上当前真正生效的权限。

扫描报告已明确：涉及 `pg_policy`、RLS、trigger、权限函数或其依赖的对象，不得凭 `rg` 零引用就判死，更不能直接删除。当前仓库还有未提交的 B3 / cross-company 权限 migration，不能把它们自动视为已上线基线。

### 影响范围

- 所有带 `relrowsecurity = true` 的 public 表，以及其 policy、grant、security-definer 函数。
- 所有被 RLS 谓词、trigger、view、函数或外键依赖的表和列。
- 清理候选中涉及 `supabase/migrations/`、RPC、RLS、审计表、权限 helper 的项目。
- 误删的后果包括：普通成员越权读取、管理员被锁在业务外、写入被拒绝、PostgREST schema cache 仍暴露旧对象，或者未来 `db push` 重放已存在 policy 时报错。

### 解决步骤（可执行）

1. **冻结清理动作**。在 BLK-1 关闭前，不删除任何涉及 DB、权限、RLS、trigger、RPC 的文件或对象。

2. **先生成仓库侧 migration 台账，不把嵌套补丁混入正式链**：

   ```bash
   rg -n -i \
     'create policy|drop policy|alter table .* (enable|force|disable) row level security|create( or replace)? function|grant .* on function|revoke .* on function|create trigger' \
     supabase/migrations -g '*.sql' \
     | sort > /tmp/dydata-repo-rls-migration-ledger.txt

   git status --short -- supabase/migrations
   git diff -- supabase/migrations
   ```

   台账必须区分：根目录正式 migration、`supabase/migrations/补丁/` 手工补丁、当前未提交 migration。补丁目录不能因为文件存在就视为 CLI 会自动执行。

3. **使用生产只读连接执行以下 SQL**。优先使用 Supabase SQL Editor 或 `psql`，不要依赖仓库未证明存在的 `exec_sql` RPC：

   ```bash
   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
     -f /tmp/dydata-blk1-production.sql \
     | tee /tmp/dydata-blk1-production-metadata.txt
   ```

   `/tmp/dydata-blk1-production.sql` 至少包含下面六类查询：

   ```sql
   -- 1) 线上哪些表真正启用了 RLS，以及是否强制作用于 owner
   select
     n.nspname as schema_name,
     c.relname as table_name,
     c.relrowsecurity as rls_enabled,
     c.relforcerowsecurity as rls_forced
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relrowsecurity
   order by c.relname;

   -- 2) 线上真实 policy 清单、角色、命令和谓词
   select
     schemaname,
     tablename,
     policyname,
     permissive,
     roles,
     cmd,
     qual,
     with_check
   from pg_policies
   where schemaname = 'public'
   order by tablename, policyname;

   -- 3) 线上真实函数定义、SECURITY DEFINER 和权限属性
   select
     n.nspname as schema_name,
     p.proname as function_name,
     pg_get_function_identity_arguments(p.oid) as identity_arguments,
     p.prosecdef as security_definer,
     p.provolatile as volatility,
     pg_get_functiondef(p.oid) as function_definition
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any (array[
       'get_daily_quota',
       'is_admin',
       'is_admin_or_owner',
       'has_permission'
     ])
   order by p.proname, identity_arguments;

   -- 4) 线上真实列，避免 migration 里写了旧列名而清理时误删依赖
   select
     table_schema,
     table_name,
     ordinal_position,
     column_name,
     data_type,
     udt_name,
     is_nullable,
     column_default
   from information_schema.columns
   where table_schema = 'public'
     and table_name = any (array[
       'profiles',
       'teams',
       'remind_logs',
       'audit_logs',
       'audit_log',
       'daily_quota_config',
       'exemption_request'
     ])
   order by table_name, ordinal_position;

   -- 5) 线上表依赖：view、FK、索引等对目标表的依赖
   select
     dependent_ns.nspname as dependent_schema,
     dependent_cls.relname as dependent_object,
     dependent_cls.relkind as dependent_kind,
     referenced_ns.nspname as referenced_schema,
     referenced_cls.relname as referenced_object,
     d.deptype
   from pg_depend d
   join pg_class dependent_cls on dependent_cls.oid = d.objid
   join pg_namespace dependent_ns on dependent_ns.oid = dependent_cls.relnamespace
   join pg_class referenced_cls on referenced_cls.oid = d.refobjid
   join pg_namespace referenced_ns on referenced_ns.oid = referenced_cls.relnamespace
   where referenced_ns.nspname = 'public'
     and referenced_cls.relname = any (array[
       'profiles',
       'teams',
       'remind_logs',
       'audit_logs',
       'audit_log',
       'daily_quota_config',
       'exemption_request'
     ])
   order by referenced_object, dependent_object;

   -- 6) 线上 migration 账本。只能在 psql / SQL Editor 中查，不能用 PostgREST 猜
   select version, name
   from supabase_migrations.schema_migrations
   order by version;
   ```

4. **对比线上 policy 与仓库 migration 预期**。下面是可直接复用的对账查询；`repo_expected` 必须从目标 migration 原文逐项录入，不能拿线上结果反填：

   ```sql
   with repo_expected(schema_name, table_name, policy_name, command_name, role_name) as (
     values
       ('public', 'remind_logs', 'admin can view all remind logs', 'SELECT', 'authenticated'),
       ('public', 'remind_logs', 'member can view own remind logs', 'SELECT', 'authenticated'),
       ('public', 'audit_logs', 'audit_logs_service_role_bypass', 'ALL', 'public'),
       ('public', 'daily_quota_config', '成员读取每日产量目标', 'SELECT', 'authenticated'),
       ('public', 'daily_quota_config', '仅管理员写入每日产量目标', 'ALL', 'authenticated')
   ),
   live_policy as (
     select
       p.schemaname as schema_name,
       p.tablename as table_name,
       p.policyname as policy_name,
       p.cmd as command_name,
       r.role_name
     from pg_policies p
     cross join lateral unnest(p.roles) as r(role_name)
     where p.schemaname = 'public'
   )
   select
     coalesce(l.schema_name, e.schema_name) as schema_name,
     coalesce(l.table_name, e.table_name) as table_name,
     coalesce(l.policy_name, e.policy_name) as policy_name,
     e.command_name as repo_command,
     l.command_name as live_command,
     e.role_name as repo_role,
     l.role_name as live_role,
     case
       when e.policy_name is null then 'LIVE_ONLY'
       when l.policy_name is null then 'REPO_ONLY'
       when e.command_name <> l.command_name or e.role_name <> l.role_name then 'DEFINITION_DRIFT'
       else 'NAME_COMMAND_ROLE_MATCH'
     end as comparison_status
   from repo_expected e
   full join live_policy l
     on l.schema_name = e.schema_name
    and l.table_name = e.table_name
    and l.policy_name = e.policy_name
    and l.role_name = e.role_name
   order by table_name, policy_name, live_role;
   ```

5. 对每个清理候选标记三种结果：`repo 有 / 线上无`、`线上有 / repo 无`、`线上有但 migration 版本未登记`。任何一项属于权限、RLS、函数或依赖对象时，先移出清理批次，补正式 migration 或单独立项。

6. 权限负责人和 DBA 对 SQL 输出签字后，才能把“线上已核实的可删对象”放回后续清理计划。未签字前，只能记录，不得删除。

### 验证方法

- `/tmp/dydata-blk1-production-metadata.txt` 存在并包含 RLS、policy、函数、列、依赖、migration 账本六类结果。
- 每个待清理 DB 对象都有明确的 `MATCH`、`REPO_ONLY`、`LIVE_ONLY` 或 `DEFINITION_DRIFT` 结论。
- `LIVE_ONLY` 和 `DEFINITION_DRIFT` 不得直接进入清理批次；必须有正式 migration 或保留决定。
- 生产验证只读，不执行 `DROP`、`ALTER POLICY`、`REVOKE`、`db push`。

### 确认人

权限负责人 + DBA。

---

## BLK-2 · 迁移链无法从零重放

### 问题描述

当前正式 migration 链存在两个会阻断 replay/deploy 的错误：

1. `supabase/migrations/065_remind_logs.sql:29,41` 使用 `CREATE POLICY IF NOT EXISTS`。当前生产 PostgreSQL 版本按扫描报告为 PG15，该语法会在 migration 执行时直接报错。
2. `supabase/migrations/067_one_shot_audit_tuning.sql:25` 对 `public.audit_log` 直接执行 `comment`，而生产实际审计活表是 `public.audit_logs`；线上漂移环境可能没有单数表。
3. 可执行修复只放在 `supabase/migrations/补丁/065-safe-patch.sql` 和 `补丁/067-safe-patch.sql`。嵌套目录不属于 CLI 按版本顺序自动执行的正式链。

### 影响范围

- `supabase db reset` 从空库重放会在 065 或 067 中断，后续 migration 根本不会执行。
- `supabase db push` 可能把一条“线上已经手工修过、但账本没有记录”的链再次推向生产，造成重复 policy、对象不存在或顺序冲突。
- 任何清理 migration、删除旧表、删除旧函数的动作都会建立在不可复现的数据库基线上，无法判断“本地没报错”是否代表生产安全。
- 这属于 deploy 级阻断，不是单个 SQL 语句的小修复。

### 解决步骤（可执行）

1. **先核对生产 migration 账本和对象现状**，禁止直接 `db push`：

   ```bash
   npx supabase migration list --linked
   git diff -- supabase/migrations/065_remind_logs.sql supabase/migrations/067_one_shot_audit_tuning.sql
   find supabase/migrations -maxdepth 2 -type f \( -name '065*' -o -name '067*' \) -print
   ```

2. **在单独分支修复正式链，而不是继续依赖 `补丁/` 目录**。

   065 的正式 migration 应把两段 policy 改成 PG15 可执行、可重复执行的形式：

   ```sql
   drop policy if exists "admin can view all remind logs" on public.remind_logs;
   create policy "admin can view all remind logs"
     on public.remind_logs
     for select
     to authenticated
     using (
       exists (
         select 1
         from public.profiles
         where id = auth.uid()
           and role in ('admin', 'owner')
       )
     );

   drop policy if exists "member can view own remind logs" on public.remind_logs;
   create policy "member can view own remind logs"
     on public.remind_logs
     for select
     to authenticated
     using (user_id = auth.uid());
   ```

   修复分支还要保留原表、索引、RLS、`count_remind_logs_for_user` 和 grant；不能只替换 policy 而漏掉同一 migration 的其他对象。

3. 067 应保留对真实活表 `public.audit_logs` 的 comment、service-role policy 和 grant；对可能不存在的 `public.audit_log` 使用条件执行，避免硬失败：

   ```sql
   do $$
   begin
     if to_regclass('public.audit_log') is not null then
       execute $sql$
         comment on table public.audit_log is
           '【已废弃】保留历史审计表，业务新写入统一走 audit_logs。'
       $sql$;
     end if;
   end $$;
   ```

   其余 `submission_batch`、`content_item`、`metric_snapshot` 等 comment 也必须沿用同样的存在性保护，或者确认 020-025 链在空库一定会创建后再执行。`补丁/067-safe-patch.sql` 的可行逻辑要合并回正式 migration 文件，不得继续把补丁当作自动执行来源。

4. **先做本地空库 replay**。该命令会重置本地 Supabase 数据，仅在本地临时库执行：

   ```bash
   npx supabase db reset
   ```

   通过标准是 065、067 及其后的 migration 全部跑完，没有 `syntax error`、`relation does not exist`、`policy already exists` 或 `duplicate object`。

5. **再做 linked dry-run，禁止直接生产推送**：

   ```bash
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run --include-all
   ```

6. 根据生产账本决定历史版本处理方式：

   - 如果确认 065/067 **从未在生产登记为 applied**，修复正式 migration 后按正常链执行，并把手工补丁作为历史说明，不再重复执行。
   - 如果确认 065/067 已在生产登记为 applied，但对象是手工补上的，禁止只靠修改本地文件“假装对齐”；由 DBA 先执行等价 SQL，再用精确 `supabase migration repair <version> --status applied --linked` 对齐账本，版本号必须逐个核对。
   - 如果生产账本与对象状态矛盾，暂停所有 migration 发布，先完成 BLK-1 对账。后置新增 migration 无法修复“空库重放在 065/067 先失败”的问题。

7. 修复完成后删除或归档嵌套补丁前，先用 `rg` 确认没有发布脚本、文档或人工 runbook 仍把它当正式入口；本轮不直接删除补丁文件。

### 验证方法

- 本地 `npx supabase db reset` 从空库完整通过。
- `npx supabase migration list --linked` 的本地 / 远端状态经过 DBA 解释，没有未登记的手工修复。
- `npx supabase db push --linked --dry-run --include-all` 不再把 065/067 作为不可执行 SQL 推送。
- 生产真实对象与正式 migration 的对应关系写入发布记录；`补丁/` 目录不再是唯一可执行来源。

### 确认人

权限负责人 + backend/DBA。

---

## BLK-3 · `get_daily_quota` 缺少可重放的完整定义

### 问题描述

代码当前明确调用 RPC：

- `src/app/(app)/admin/settings/page.tsx:38`
- `src/app/api/daily-quota-config/route.ts:50`

当前根目录 migration 中没有完整建表 / 建函数来源；`20260919030217_daily_quota_minimum_privileges.sql` 只在对象已存在时收紧权限，不负责创建对象。进一步追溯发现，完整定义曾存在于已删除的历史 migration：

```text
git show 566225e7:supabase/migrations/20260707090000_video_review_production_accounting.sql
```

该 migration 后来在 `8903039e` 被整体删除，导致“应用继续调用、当前迁移链没有来源”的 drift。

完整函数定义为：

```sql
create or replace function public.get_daily_quota(p_date date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select daily_target
      from public.daily_quota_config
      where effective_date <= p_date
      order by effective_date desc
      limit 1
    ),
    4
  )::int;
$$;
```

配套表的历史定义是 `daily_quota_config(id uuid, effective_date date unique, daily_target int 1-50, created_by uuid, note text, created_at timestamptz)`。历史 migration 还创建了 `work_submissions`、截图 bucket、`get_production_dashboard` 等其他对象；BLK-3 不应把整份旧 migration 原样复活。

### 影响范围

- 空库 `db reset` 后，`/admin/settings` 页面和 `/api/daily-quota-config` GET 会因 RPC 缺失返回 `PGRST202/PGRST205` 或 500。
- 日报目标读取链断裂；页面虽然有 `4` 的应用层 fallback，但 RPC 报错会先阻断正常响应，不能把 fallback 当成数据库修复。
- 直接 REST RPC、生产设置页、日报目标历史列表都受影响。
- 只补 grant 不补函数定义，会继续把问题隐藏到下一次新环境部署。

### 解决步骤（可执行）

1. **先查线上对象，不先写新 migration**：

   ```sql
   select to_regclass('public.daily_quota_config') as table_oid,
          to_regprocedure('public.get_daily_quota(date)') as function_oid;

   select pg_get_functiondef('public.get_daily_quota(date)'::regprocedure);

   select table_schema, table_name, column_name, data_type, udt_name,
          is_nullable, column_default
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'daily_quota_config'
   order by ordinal_position;

   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public'
     and tablename = 'daily_quota_config';

   select grantee, privilege_type
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'daily_quota_config'
   order by grantee, privilege_type;

   select has_function_privilege('anon', 'public.get_daily_quota(date)', 'EXECUTE') as anon_can_execute,
          has_function_privilege('authenticated', 'public.get_daily_quota(date)', 'EXECUTE') as authenticated_can_execute,
          has_function_privilege('service_role', 'public.get_daily_quota(date)', 'EXECUTE') as service_role_can_execute;
   ```

2. 把线上 `pg_get_functiondef` 与历史定义逐字对比，重点确认：参数名 `p_date`、默认值 `4`、`SECURITY DEFINER`、`search_path`、按 `effective_date <= p_date` 取最近规则的排序逻辑。任何差异先由 backend/DBA 定义目标行为。

3. **新增一条只负责日报目标对象的正式 migration**，不要恢复已删除的整份 `20260707090000_video_review_production_accounting.sql`。新 migration 至少包含以下结构；policy 谓词以 BLK-1 线上对账结果为准：

   ```sql
   create table if not exists public.daily_quota_config (
     id uuid primary key default gen_random_uuid(),
     effective_date date not null unique,
     daily_target int not null check (daily_target between 1 and 50),
     created_by uuid references public.profiles(id),
     note text,
     created_at timestamptz not null default now()
   );

   alter table public.daily_quota_config enable row level security;

   drop policy if exists "成员读取每日产量目标" on public.daily_quota_config;
   create policy "成员读取每日产量目标"
     on public.daily_quota_config
     for select
     to authenticated
     using (true);

   drop policy if exists "仅管理员写入每日产量目标" on public.daily_quota_config;
   create policy "仅管理员写入每日产量目标"
     on public.daily_quota_config
     for insert
     to authenticated
     with check (public.is_admin());

   create or replace function public.get_daily_quota(p_date date)
   returns int
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select coalesce(
       (
         select daily_target
         from public.daily_quota_config
         where effective_date <= p_date
         order by effective_date desc
         limit 1
       ),
       4
     )::int;
   $$;

   revoke all on function public.get_daily_quota(date) from public, anon;
   grant execute on function public.get_daily_quota(date) to authenticated, service_role;
   grant select, insert on public.daily_quota_config to authenticated, service_role;
   ```

   注意：如果 BLK-1 对账证明线上 policy 名称、角色或 predicate 已经是另一套，必须保留线上已确认的安全边界；不能为了让空库通过而扩大权限。历史 seed (`2026-07-07 = 4`, `2026-07-14 = 6`) 只有在 DBA 确认新环境需要时才用 `on conflict do nothing` 补入，不能覆盖生产已有目标。

4. 在本地空库执行并核对函数：

   ```bash
   npx supabase db reset
   npx supabase db push --linked --dry-run --include-all
   ```

   本地 SQL 验证：

   ```sql
   select public.get_daily_quota(date '2026-07-10') = 4 as fallback_or_first_rule_ok;
   select public.get_daily_quota(date '2026-07-14') = 6 as latest_rule_selection_ok;
   ```

5. migration 上线后刷新 PostgREST schema cache，并分别用设置页和接口验证；不得只验证 SQL 函数存在：

   ```sql
   notify pgrst, 'reload schema';
   ```

   ```bash
   npx tsx --test src/lib/loaders/admin-settings-page.test.ts
   curl -i "https://dydata.cc/api/daily-quota-config?date=2026-09-19"
   ```

   `curl` 需要使用已登录会话或等价受控请求，不能把未登录 401 误判为 RPC 已修复。

### 验证方法

- `pg_get_functiondef('public.get_daily_quota(date)')` 在线上和本地均返回完整定义。
- 空库 reset 后表、RLS、函数、grant 全部存在；`get_daily_quota` 对“无历史规则”和“命中最近规则”两种日期返回正确值。
- `20260919030217_daily_quota_minimum_privileges.sql` 不再是唯一来源；新 migration 能从零创建对象。
- `/admin/settings` 和 `/api/daily-quota-config` 的登录态读取均成功，且未扩大 anon 权限。

### 确认人

backend/DBA。

---

## BLK-5 · 静态检查工具缺失，缺少编译器级证据

### 问题描述

仓库未安装 knip、dependency-cruiser、ts-prune 等死代码工具。扫描报告里的“零引用”来自 `rg` 交叉搜索，不等于 TypeScript 编译器、动态 import、测试源码断言或 Next.js 构建都认可删除。

### 影响范围

- 所有 A 类“零引用”删除项，尤其是被测试通过 `import.meta.url`、字符串、动态 import 或源码断言间接撑活的文件。
- 删除导出、路由、Server Action、配置或类型时，可能只在编译 / 构建阶段才暴露错误。
- 只跑 `rg` 可能留下失效测试，也可能误删仍被动态加载的模块。

### 解决步骤（可执行）

1. 清理每一批开始前跑一次只读 TypeScript 基线，不安装新工具、不把全量 gate 当作默认验收：

   ```bash
   npx tsc --noEmit --pretty false 2>&1 | tee /tmp/dydata-tsc-before-cleanup.txt
   ```

2. 对准备删除的符号执行定义、静态引用、字符串引用和动态加载四类搜索：

   ```bash
   rg -n -S '目标符号名|目标文件名|目标路由字符串' src scripts tests docs
   rg -n -S 'import\(|dynamic\(|import.meta.url|readFileSync|fetch\(|router\.(push|replace)|redirect\(' src scripts tests
   ```

   将“定义文件自身命中”和“测试存在性断言”分开记录；不能把测试命中当成生产调用，也不能忽略测试命中直接删文件。

3. 每个清理批次采用小范围定向测试；例如本轮权限 / migration 相关改动至少使用：

   ```bash
   npx tsx --test src/lib/b3-database-boundary-migration.test.ts
   npx tsx --test src/lib/team-join/service.test.ts
   ```

   其他批次按实际受影响测试文件追加，不在本阻断中主动扩大到全量门禁。

4. 修改后重新跑：

   ```bash
   npx tsc --noEmit --pretty false
   git diff --check
   ```

   如果 TypeScript 基线本身失败，先保留基线输出；只有确认“本批没有新增错误”并由主负责人批准，才能继续低风险清理。连续两次同一路径失败时停止，不用换成更宽泛的删除方案掩盖错误。

### 验证方法

- 删除前和删除后各有一份 `tsc` 输出，能够证明错误数量没有新增。
- 受影响测试和动态引用搜索均完成，`git diff --check` 退出码为 0。
- 不把“rg 零引用”单独作为可删除证据。

### 确认人

阿禅 / 主负责人。

---

## BLK-6 · 无法确认的对外触发入口

### 问题描述

下列入口不一定有 UI 调用，但可能由外部系统、定时调度或探针触发：

- `/api/feishu/event`：飞书 webhook，且在 API 限流中被豁免。
- `/api/supabase-keepalive`：Vercel cron 保活。
- `/api/notifications/cleanup`：Vercel cron 清理过期通知。
- `/api/health`：外部探针和 Supabase 连通性检查。

`rg` 找不到前端引用，只能说明没有仓库内 UI 入口，不能证明线上没有外部调用。

### 影响范围

- 删除飞书 webhook 会导致飞书 URL 校验、机器人事件回调和异步回复失效。
- 删除 cron 路由会让保活、通知清理失效，并可能造成通知表持续膨胀。
- 删除 health 路由会让部署探针误报站点故障，影响运维判断。
- 外部入口通常没有前端类型或 import 证据，属于静态扫描无法覆盖的风险。

### 解决步骤（可执行）

1. **把四条路由从清理候选中永久标记为“外部触发保护”**，没有独立流量证据和 owner 批准不得删除。

2. 先核对仓库内调度配置和豁免规则：

   ```bash
   rg -n -C 3 'feishu/event|supabase-keepalive|notifications/cleanup|/api/health|crons' \
     vercel.json src docs scripts

   sed -n '1,120p' vercel.json
   ```

   当前 `vercel.json` 的正式 cron 为：

   ```text
   /api/supabase-keepalive       30 6 * * *
   /api/notifications/cleanup    0 18 * * *
   ```

3. 做低风险线上 smoke，不携带写入参数、不执行 cron 正向动作：

   ```bash
   curl -fsS https://dydata.cc/api/health
   curl -fsS 'https://dydata.cc/api/health?check=supabase'
   curl -i https://dydata.cc/api/feishu/event
   curl -i https://dydata.cc/api/supabase-keepalive
   curl -i https://dydata.cc/api/notifications/cleanup
   ```

   预期：health 返回可解析的 200；cron 路由在没有有效 Bearer secret 时应被拒绝；飞书 GET 仍返回服务状态。不要把 cron 未授权 401/403 误判成路由不存在。

4. 对飞书回调只做 challenge 级验证，避免触发业务消息处理：

   ```bash
   curl -fsS -X POST https://dydata.cc/api/feishu/event \
     -H 'content-type: application/json' \
     --data '{"type":"url_verification","challenge":"blk6-check"}'
   ```

   预期返回 `{"challenge":"blk6-check"}`；该请求不应进入机器人消息处理逻辑。

5. 由运维 / 外部系统 owner 查询真实触发证据：

   - Vercel Cron 最近 90 天对两个路径的执行记录和失败记录。
   - Vercel Logs 最近 90 天 `/api/health` 的探针访问，以及 `/api/supabase-keepalive`、`/api/notifications/cleanup` 的成功执行。
   - 飞书开发者后台的事件订阅地址、最近投递记录和失败重试记录。
   - 如果确认要下线，先在外部系统解除 webhook / cron / probe，再保留一个返回明确 410 的过渡版本，观察一个完整调度周期后才能删除文件。

6. 只有在外部 owner 明确签字“已解除外部触发”后，才允许把对应路由放入清理批次。没有证据时默认保留，不把“UI 零引用”升级为“路由死代码”。

### 验证方法

- `vercel.json` 中的 cron 路径与代码路由一一对应。
- health、Feishu challenge、cron 未授权 smoke 结果已留存。
- 运维 / 飞书 owner 提供最近 90 天外部触发记录；若无记录，提供对应系统的停用截图或配置变更记录。
- 当前清理批次不删除四条外部入口，也不删除其测试和鉴权 helper。

### 确认人

运维 + 飞书应用负责人 + backend owner。

---

## 六项阻断的统一关闭标准

只有同时满足以下条件，才可以开始扫描报告 §8 的清理批次：

1. BLK-1：线上 RLS / 函数 / 依赖 / migration 账本有只读快照，权限负责人和 DBA 已对账。
2. BLK-2：065/067 正式 migration 可从空库 replay，补丁目录不再是唯一修复来源。
3. BLK-3：`get_daily_quota` 有正式 migration 来源，空库和线上调用均通过。
4. BLK-4：当前 65 项未提交改动已由负责人落地或冻结，清理基线重新生成。
5. BLK-5：清理批次有 `tsc` 前后基线、定向测试和动态引用检查。
6. BLK-6：四条外部入口已确认保留，或由对应外部 owner 完成停用并留下证据。

任一项没有证据，只能标记为“待确认”，不得进入清理施工。
