# 清理收尾：AI 独立核查结论

核查执行日：2026-09-19（本机 Asia/Jakarta 已进入 2026-09-20；文件名按任务要求使用 `2026-09-20`）。

范围：只读核查与本地 A-28 构建实验。未改 `src/`，未执行 migration，未 push，未 commit。

## 判定规则

1. 仓库外部零引用 + 代码自身有鉴权/范围校验 + 有现行替代路径，结论为“删”。
2. API 路由不能把 middleware 当成细粒度权限兜底：`src/middleware.ts` 对无登录 API 只做限流，不会统一拦截；必须检查路由自身的 `requireAdminActor` / `requireExemptionManagerActor`。
3. 任何可能来自外部编译 action id、旧客户端或 PostgREST 直连的调用，只能判“观察后删”或“建议不删”，不能用 repo 零引用替代线上调用证据。
4. 数据库项必须同时看 `pg_proc`、`pg_depend`、`pg_policies`、真实列和线上 migration 账本；`pg_stat_user_functions` 未开启统计时，调用数只能记为“未知”。

## 总表

| 项 | 结论 | 证据摘要 | 需阿禅拍板？ |
|---|---|---|---|
| 批次 2 A-15a～A-15f、A-16～A-18 | **删** | repo 外部引用为 0；Server Action 或路由自身有鉴权；现行替代路径已存在 | 否 |
| 批次 2 A-15g `reviewExemptionRequest` | **不删** | 只剩测试源码断言，但属于豁免写路径；外部编译 action id 无线上证据；阿禅已同意保留 | 否（已拍板） |
| 批次 2 A-15h admin 版 `submitExemptionRequest` | **不删** | 无 importer，但只有登录校验，且外部编译 action id 无线上证据；阿禅已同意保留 | 否（已拍板） |
| BLK-1 RLS 快照 | **对象面通过，账本有漂移** | RLS/policy/函数/列关键摘要未变；migration 159 → 161 | 否 |
| B-16 6 个有运行记录的历史 RPC | **保留** | `pg_stat_statements` 自 2026-05-26 重置后记录到 19～12608 次 PostgREST 调用，已证明线上仍在运行 | 否 |
| B-16 7 个未匹配的历史 RPC | **暂不删，观察 4 周** | `pg_stat_statements` 未匹配不能证明零调用，且 `track_functions=none`；阿禅已同意开启 `track_functions=all` 观察 | 否（已拍板） |
| B-16 `get_daily_quota` | **保留** | 代码有 2 个现役 RPC 调用，线上刚补入 `20260920003000` | 否 |
| A-21 `/claim` | **暂不删，观察 4 周** | repo 无 UI 调用，现行 UI 用 `/start-scripting`；缺近 90 天访问日志；阿禅已同意观察方案 | 否（已拍板） |
| A-23 `/api/exemptions/orphan` | **删** | 路由无外部 repo 引用；线上 `exemption_request`、`profiles`、`teams` 及所需列均存在；活 lib/loader 仍保留 | 否 |
| A-12 `资料加载.ts` | **删** | 无 importer；线上 5 个豁免列和 `team_id` 全存在 | 否 |
| A-28 `tailwind.config.ts` | **删** | 删除配置和依赖后 `npm run build` 通过，路由产物和主题/动画 marker 无差异，已回滚 | 否 |

## 1. 批次 2：11 个安全项

### 共用证据

- `rg` 复核：`updateExemption`、`clearExemption`、`adminUpdateReport`、`adminDeleteReport`、`removeMemberFromTeam`、`hasPendingExemptionRequest` 在排除定义文件后均为 0 命中；`reviewExemptionRequest` 只剩 `src/lib/atomic-exemption-migration.test.ts:109` 的源码字符串断言；admin 版 `submitExemptionRequest` 无 importer，其他命中均解析到 dashboard 版。
- `src/middleware.ts:225-230` 只对页面路由做无 cookie 登录跳转；`src/middleware.ts:241-279` 只有已有 cookie 时才进一步验 session。API 无 cookie 时不会由 middleware 统一返回 401，因此 API 路由自身鉴权不能省略。
- Server Action 自身证据：`admin/actions.ts:258-289`、`:344-375`、`:463-516`、`:519-557` 均先取用户/权限并做范围检查；`dashboard/actions.ts:188-193` 至少先验 session。
- 路由自身证据：`src/app/api/admin/auth-helper.ts:37-49` 的 `requireAdminActor` 验证登录、权限；`src/app/api/admin/collaboration/handlers.ts` 的活函数均依赖该 helper。

| 项 | 结论 | 证据摘要 | 需阿禅拍板？ |
|---|---|---|---|
| A-15a `updateExemption` | **删** | `rg -n "\\bupdateExemption\\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'`：0 命中；现行豁免写入走 API/RPC；函数自身有登录、豁免权限、成员范围和归档检查。 | 否 |
| A-15b `clearExemption` | **删** | 同样 `rg`：0 命中；函数自身有登录、豁免权限、成员范围和归档检查；实际清除逻辑已由现行原子 grant 入口承载。 | 否 |
| A-15c `adminUpdateReport` | **删** | `rg -n "\\badminUpdateReport\\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'`：0 命中；函数自身要求 `review_content`，报表编辑已有 `/api/video-submit/edit-detail`。 | 否 |
| A-15d `adminDeleteReport` | **删** | `rg -n "\\badminDeleteReport\\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'`：0 命中；函数自身要求 `review_content` 并写审计，无生产 importer。 | 否 |
| A-15e `removeMemberFromTeam` | **删** | `rg -n "\\bremoveMemberFromTeam\\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'`：0 命中；`admin/actions.ts:831-835` 只是 `updateMemberTeam(targetUserId, null)` 薄包装，成员处置已由 `archiveMember` 现行路径承载。 | 否 |
| A-15f `hasPendingExemptionRequest` | **删** | `rg -n "\\bhasPendingExemptionRequest\\b" src scripts tests -g '!src/app/(app)/dashboard/actions.ts'`：0 命中；函数只有旧的个人 pending 查询，现行待办/loader 已承担同类判定。 | 否 |
| A-15g `reviewExemptionRequest` | **不删** | 非定义命中只剩 `atomic-exemption-migration.test.ts:109`；函数仍位于豁免写路径中且有完整范围校验，但外部编译 action id 无法由 repo 排除，且当前没有线上调用日志证据。 | 否（已拍板） |
| A-15h admin 版 `submitExemptionRequest` | **不删** | `rg -n "submitExemptionRequest" src scripts tests` 显示实际 UI importer 在 dashboard 版；admin 版无 importer，但自身只有登录校验、没有额外管理权限校验，且存在外部 action id 不可见疑点。 | 否（已拍板） |
| A-16 `buildSummaryResponse` | **删** | `rg` 复核只剩 `handlers.ts` 定义；`src/app/api/admin/collaboration/` 现有路由树没有 `summary/` 或 `operators/`；活路由使用 person/attribution/unattributed。 | 否 |
| A-17 `/api/admin/collaboration/staff` | **删** | `rg -n "collaboration/staff|buildStaffResponse" src scripts tests` 只命中该路由自身；handler 仍有 `requireAdminActor`，但当前没有 repo 消费方，删除路由不影响共享 `_shared` 数据加载。 | 否 |
| A-18 `/api/admin/collaboration/talents` | **删** | `rg -n "collaboration/talents|buildTalentsResponse" src scripts tests` 只命中该路由自身；handler 仍有 `requireAdminActor`，达人数据现由服务端页面加载器承载。 | 否 |

## 2. BLK-1：RLS 快照对账

### 只读复核命令与输出

```text
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At -F '|'

snapshot 2026-09-19-permission-live-inventory.txt -> current direct SELECT
schema_migrations_count       159 -> 161
pg_policies_all_count         263 -> 263
pg_policies_public_count      261 -> 261
rls_public_count               103 -> 103
range_function_policies        32 -> 32
target_function_count           9 -> 9
profiles_role_mismatch          0 -> 0
group_mode_sessions             19 total / 0 active / 0 unrevoked-not-expired
current same:                   19 / 0 / 0
profiles exempt columns         5 / 5 present
```

当前线上 migration 账本新增/补齐的尾部为：

```text
20260920003000 | backfill_daily_quota_objects
20260919095135 | <线上 name 为空>
20260919030217 | daily_quota_minimum_privileges
20260918121244 | fix_teams_delete_company_scope
```

结论：**BLK-1 对象面复核通过，但原快照不再完整代表线上现状**。RLS 表清单、policy 数量、range-function policy 数量、9 个关键函数数量、profiles 关键列、角色映射和 group-mode 计数均未漂移；唯一确认的漂移是 migration 账本从 159 条变为 161 条，新增 `20260919095135` 与 `20260920003000`。原始快照没有保存 canonical digest，因此本轮以完整 RLS/policy 清单中的关键计数、range policy 数量、目标函数签名和目标表 policy/列查询做对账，没有把不可机械 hash 的历史文本伪装成逐字 diff。这项由 AI 复核签字完成，不再等待其他人；执行任何数据库/RPC 清理前，应先把这两条账本漂移补进新快照。

## 3. B-16：14 个 RPC 候选

### 线上直接 SELECT 证据

```text
b16_orphan_rpc: 14/14 exists_live=t
internal_dep_count: 14/14 = 0
b16_policy_text_hits: 0
b16_pg_stat_user_functions: 0

ACL:
13 个历史候选 + get_daily_quota：authenticated EXECUTE=t；
除 get_daily_quota 外，anon EXECUTE 也为 t；service_role EXECUTE=t；
get_daily_quota：authenticated=t、anon=f、service_role=t。
```

补充线上证据（核查截止 2026-09-20 01:09:34，Asia/Jakarta）：`pg_stat_statements` 已启用，统计自 `2026-05-26 03:14:17.81621+00` 重置后累计至核查时点。排除函数定义、授权等 DDL 文本后，6 个历史 RPC 命中 PostgREST 运行语句；其余 7 个未匹配。该视图没有 `last_exec_time`，所以能证明“调用过”，不能证明最近仍在调用；未匹配也不能证明从未调用。`track_functions=none`，后续观察必须开启 `track_functions=all`，不能使用 `pl`。

| 函数 | repo 证据 | 线上证据 | 结论 | 需阿禅拍板？ |
|---|---|---|---|---|
| `conversion_hub_advice_list` | 仅 `supabase/migrations/060_conversion_hub_unify.sql` 定义/授权 | `pg_stat_statements` 0 次、0 条匹配；不能证明零调用 | **暂不删**；开启 `track_functions=all` 观察 4 周 | 否（已拍板） |
| `conversion_hub_pipeline_counts` | 仅 migration 定义/授权 | 0 次、0 条匹配；不能证明零调用 | **暂不删**；同一观察方案 | 否（已拍板） |
| `conversion_hub_weekly_items` | 仅 migration 定义/授权 | 0 次、0 条匹配；不能证明零调用 | **暂不删**；同一观察方案 | 否（已拍板） |
| `publish_drafts_approved_list` | 仅 `20260601100000_create_publish_drafts.sql` 定义/授权 | **388 次**、3 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `publish_drafts_review_queue` | 仅 migration 定义/授权 | **105 次**、1 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `admin_pending_videos_today` | 仅 `059_admin_cockpit_rpc.sql` / 压力缓解 migration 定义 | 0 次、0 条匹配；不能证明零调用 | **暂不删**；开启 `track_functions=all` 观察 4 周 | 否（已拍板） |
| `admin_pending_violations` | 仅 `059_admin_cockpit_rpc.sql` 定义 | 0 次、0 条匹配；不能证明零调用 | **暂不删**；同一观察方案 | 否（已拍板） |
| `admin_analytics_first_screen` | 仅 `20260530052000_admin_first_screen_guardrails.sql` 定义 | **50 次**、1 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `admin_sidebar_badges_summary` | 仅同一首屏 migration 定义 | **12608 次**、1 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `admin_anomaly_videos_today` | 仅 `20260531140000_admin_anomaly_videos_today.sql` 定义 | **103 次**、1 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `case_library_processed` | 仅 `20260527000000_case_library_processed.sql` 定义 | **19 次**、1 条匹配；来源为 PostgREST | **保留**；已有真实线上运行记录 | 否 |
| `validate_invite_code` | 仅 `004_validate_invite_function.sql` 定义 | 0 次、0 条匹配；`track_functions=none` | **暂不删**；匿名也有 EXECUTE，观察 4 周 | 否（已拍板） |
| `get_today_submission_status` | 仅早期 003/005/008/009 migration 定义 | 0 次、0 条匹配；`track_functions=none` | **暂不删**；早期客户端直连风险最高，观察 4 周 | 否（已拍板） |
| `get_daily_quota` | `src/app/api/daily-quota-config/route.ts:50`、`src/app/(app)/admin/settings/page.tsx:40` 明确 `.rpc("get_daily_quota")`；且线上刚补入 `20260920003000` | 存在、依赖 0、policy 命中 0、统计为 0 但有现行代码调用 | **保留**；不是孤儿 | 否 |

推荐方案：6 个已有运行记录的 RPC 直接保留，不进入删除清单；其余 7 个开启 `track_functions=all` 观察 4 周，再依据真实调用量逐个决定。现在不直接删，因为未匹配不等于零调用，而且它们对 `authenticated`（其中一个还对 `anon`）开放，数据库层没有 `src/middleware.ts` 这样的应用中间件兜底。

## 4. A-21：旧 `/claim` 路由

| 项 | 结论 | 证据摘要 | 需阿禅拍板？ |
|---|---|---|---|
| A-21 `/api/topics/sub-topics/[id]/claim` | **暂不删，观察 4 周** | `rg -n "sub-topics/.*/claim[^s]" src scripts tests -g '!**/claim/**'` 没有 UI 消费方；唯一测试耦合为 `src/app/api/topics/membership-guard.test.ts:21`；现行 UI 明确调用 `/start-scripting`（`TopicHubV2.tsx:338-339`），两路都调用 `startWritingClaim`。最终结论不依赖 Vercel CLI，本轮仍缺少线上近 90 天访问日志。 | 否（已拍板） |

推荐先观察 4 周或补拿近 90 天 access log；期间不删。只要确认 `/claim` 有真实流量，就保留兼容壳；确认无流量后再删路由与 `membership-guard.test.ts:21` 条目。

## 5. A-23 / A-12：线上 schema 直接核对

### A-23 `/api/exemptions/orphan`

```text
rg -n "exemptions/orphan" src scripts tests -g '!src/app/api/exemptions/orphan/**'
-> 0 个 route 外部命中；同一 lib 被 admin-modules loader 与 action-center 使用

线上 SELECT:
a23_tables_present = exemption_request,profiles,teams
exemption_request 必需列 = id, applicant_user_id, team_id, exemption_type,
  exemption_category, start_date, end_date, reason, request_status, created_at
profiles 必需列 = id, name, team_id, membership_status
```

路由自身的 `requireExemptionManagerActor` + `company_owner` 检查位于 `src/app/api/exemptions/orphan/route.ts:20-25`；数据库对象和代码假设吻合，现行页面已经直接使用 `loadOrphanExemptionRequests`。结论：**删路由，不删 `src/lib/exemption-orphan.ts`，不删 loader/action-center 消费方**。无需阿禅拍板。

### A-12 `src/app/(app)/admin/资料加载.ts`

```text
rg -n "loadProfilesWithExemptionFallback|资料加载" src scripts tests \
  -g '!src/app/(app)/admin/资料加载*.ts*'
-> 0 个 importer

线上 SELECT:
a12_columns_present = 5
profiles.exempt_type        text
profiles.exempt_start_date  date
profiles.exempt_end_date    date
profiles.exempt_reason      text
profiles.exemption_category text
profiles.team_id             uuid
```

代码假设的豁免列、`team_id` 均已在线上存在；现行 `admin-modules` 直接读取这些列，旧 fallback 没有消费者。结论：**删 `资料加载.ts` 与 `资料加载.test.ts`**。无需阿禅拍板。

## 6. A-28：Tailwind 死配置本地实验

实验步骤：备份 `tailwind.config.ts`、`package.json`、`package-lock.json` 到 `/tmp`；临时删除 `tailwind.config.ts`，临时移除 `tailwindcss-animate` 依赖；分别执行 `npm run build`；对比路由产物和主题/动画 marker；最后 `git checkout -- tailwind.config.ts package.json package-lock.json` 回滚。

```text
baseline npm run build: exit=0
experiment npm run build: exit=0
route diff: 无差异
baseline markers: pulse-claude / fade-in-up / claude-canvas / Iowan 均存在
experiment markers: 相同
temporary diff: package-lock.json 11 行、package.json 1 行、tailwind.config.ts 65 行
rollback: rollback_ok
git diff --check: 通过
```

结论：**可删**。Tailwind v4 CSS-first 入口可独立构建，删除 legacy config 和 `tailwindcss-animate` 不改变当前 build 路由产物或已核对的主题/动画 marker；注意保留 `tw-animate-css`，它仍由 `src/app/globals.css:3` 使用。无需阿禅拍板。

## 阿禅已拍板（2026-09-20）

1. `reviewExemptionRequest`：不删。
2. admin 版 `submitExemptionRequest`：不删。
3. 旧 `/api/topics/sub-topics/[id]/claim`：暂不删，观察 4 周后再判断。
4. B-16：6 个已有线上运行记录的 RPC 保留；其余 7 个暂不删，开启 `track_functions=all` 观察 4 周后再判断。

## 下一轮执行清单（仅列已验证安全项）

1. 先刷新 BLK-1 证据文件，补入线上 migration `20260919095135` 与 `20260920003000`；这是证据更新，不改数据库。
2. 执行 A-28：删除 `tailwind.config.ts` 与 `tailwindcss-animate`，刷新 lock，重跑 `npm run build`。
3. 执行 A-12：删除 `资料加载.ts` 与配套测试，跑定向测试。
4. 执行批次 2 的 A-15a～A-15f：删 6 个零引用旧 Server Action，跑定向测试和 `rg` 复核。
5. 执行批次 2 的 A-16～A-18：删 2 个死 handler 和 staff/talents 死路由，跑 collaboration 定向测试。
6. 执行 A-23：只删 `/api/exemptions/orphan` 路由及其 route test，保留 `exemption-orphan.ts`、loader、action-center。
7. A-21 完成 4 周观察并取得零调用证据后，再决定是否进入删除执行。
8. B-16 的 7 个未匹配 RPC 开启 `track_functions=all` 并完成 4 周观察后，再决定是否进入删除执行；6 个已有运行记录的 RPC 和 `get_daily_quota` 不进入删除清单。

## 观察执行状态

- A-21：已在旧路由成功完成鉴权后写入固定动作 `cleanup_observation_a21_claim`，不记录请求体、参数或用户资料；四周后查询 `audit_logs` 命中数。
- B-16 7 个 RPC：已确认当前直连账号无权修改 `track_functions`，事务测试已回滚；必须由 Supabase 项目高权限入口开启 `track_functions=all`，本地不能伪造完成。
- 复核日期：2026-10-18，已写入 `docs/待办清单.md` 并设置提醒。

## 本轮未做

- 未改 `src/`、未执行 migration、未做生产 DDL/DML、未 commit、未 push。
- Vercel 只取得约 1 小时时间窗，未把它伪装成 90 天证据；A-21 与两个旧 Server Action 的历史调用仍是明确缺口。B-16 已补到 `pg_stat_statements` 累计证据，但 7 个未匹配 RPC 仍不能据此判零调用。
