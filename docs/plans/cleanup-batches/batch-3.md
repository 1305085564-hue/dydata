---
批次 3: 死 API 路由 + 测试同步
优先级: P1
预估工时: 3h
前置依赖: A-21 先查线上近 90 天流量（运维）；BLK-4；membership-guard.test.ts 同步修改为硬性配套
---

> **2026-09-19 拍板（阿禅）**: A-22（退回选题）与 A-24/A-25（数据导出）**撤案不删，转待办挂账**（见 `docs/待办清单.md` P3 末尾两条）。本批实际执行项 = A-19、A-20、A-21、A-23、A-26。
>
> 关键耦合（2026-09-19 实测）：`src/app/api/topics/membership-guard.test.ts` 的 `ROUTE_FILES` 列表以 `readFileSync` 断言每个路由文件——**条目在 :16(options)、:18(feishu-workspace)、:23(claim)、:25(return)**。删路由不同步删条目 = 测试 ENOENT 红。
> 复核修正：报告所称 claim/return 的 `route.test.ts` 磁盘上**不存在**，无需处理；`api-path-validation.test.ts:12-14` 只用 URL 字符串样例做纯函数测试，不读文件、不用改。

## 清理清单

- [x] A-19: `/api/topics/feishu-workspace` 整路由死（`src/app/api/topics/feishu-workspace/route.ts`，GET 在 :8）——2026-09-19 已删目录 + membership-guard 条目；`src/lib/topics/feishu-workspace.ts` 保留（page 在用）
  - 引用证明: `rg -n "topics/feishu-workspace" src scripts tests -g '!src/app/api/topics/feishu-workspace/**'` → 仅 membership-guard.test.ts:18。消费侧事实：`src/app/(app)/topics/page.tsx:8` 服务端直接 `import { loadFeishuWorkspaceUrl }`，绕过 API（2026-09-19 复核 page.tsx 头部 import 成立）。
  - 删除范围: `src/app/api/topics/feishu-workspace/` 整目录 + `membership-guard.test.ts:18` 条目。**保留 `src/lib/topics/feishu-workspace.ts`（page 在用）。**
  - 测试耦合: `membership-guard.test.ts:18`。
  - 验证命令: `rg -n "api/topics/feishu-workspace" src`（空）+ `npm test` 定向 `tsx --test src/app/api/topics/membership-guard.test.ts`。
- [x] A-20: `/api/topics/options` 整路由死（`src/app/api/topics/options/route.ts`，GET :4）——2026-09-19 已删目录 + membership-guard 条目；`loadTopicOptions` 保留（bootstrap 的 Promise.all 在用）
  - 引用证明: `rg -n "topics/options|loadTopicOptions" src scripts tests -g '!src/app/api/topics/options/**'` → 无 fetch；已被 `/api/topics/bootstrap` 取代（`TopicHubV2.tsx` fetch bootstrap；`lib/topics/service.ts` 的 `loadTopicLibraryBootstrap` 内 Promise.all 一次返回 options）。
  - 删除范围: `src/app/api/topics/options/` 整目录 + `membership-guard.test.ts:16` 条目；`loadTopicOptions` 若仅被该路由使用则连 lib 定义一并删（先 `rg -n "\bloadTopicOptions\b" src` 确认消费面）。
  - 测试耦合: `membership-guard.test.ts:16`。
  - 验证命令: 同模式 rg 复验 + `npm test`。
- [ ] A-21: `/api/topics/sub-topics/[id]/claim` 兼容壳（`.../claim/route.ts`，POST :9）
  - 引用证明: `rg -n "sub-topics/.*/claim[^s]" src scripts tests -g '!**/claim/**'` → UI 只调 `start-scripting`（`TopicHubV2.tsx`），`claim` 与 `start-scripting` 调同一 `startWritingClaim`。membership-guard.test.ts:23 为唯一测试耦合。
  - 删除范围: `claim/` 整目录 + `membership-guard.test.ts:23` 条目 + 路由头注释自述的"零流量后删除"待办一并了结。
  - 测试耦合: membership-guard:23；`startWritingClaim`（`lib/topics/service.ts`）保留（start-scripting 在用）。
  - 验证命令: rg 复验 + `npm test`。
  - **前置（硬性）**: 运维查线上近 90 天 `/claim` 流量（Vercel 日志）。有流量 → 本项停。
- [x] A-22: ~~`/api/topics/sub-topics/[id]/return` 未接线取消入口~~ → **撤案：保留，转正式需求**（2026-09-19 阿禅拍板"保留，排进需求"）
  - 引用证明: `rg -n "cancelWritingClaim" src scripts tests` → 除本路由与 membership-guard 外零调用；topics-v2 无 fetch `/return`。
  - 处置: 路由、`cancelWritingClaim`、`membership-guard.test.ts:25` 条目**全部原样保留**；需求已挂 `docs/待办清单.md` P3（正式开发时补前端入口与状态流转）。
  - 验证命令: 无（本项不动代码）。
- [ ] A-23: `/api/exemptions/orphan` 整路由死（`src/app/api/exemptions/orphan/route.ts`，GET :44）
  - 引用证明: `rg -n "exemptions/orphan" src scripts tests -g '!src/app/api/exemptions/orphan/**'` → 真实来源为服务端 `src/lib/loaders/admin-modules.ts`（loadOrphanExemptionRequests）→ `admin/modules/page.tsx` props 注入；计数走 `/api/action-center/summary`。
  - 删除范围: `orphan/` 整目录（route.ts + route.test.ts 同删）；`requireExemptionManagerActor`/`isCompanyOwnerActor` 等 helper 若他处仍用则保留（`rg -n "\brequireExemptionManagerActor\b" src` 复核后再决定）。
  - 测试耦合: `src/app/api/exemptions/orphan/route.test.ts` 整体随删。
  - 验证命令: rg 复验 + `npm test`。
  - **前置**: 后端核对 RLS/运维是否手动调用（触达权限/审计）。
- [x] A-24: ~~`/api/export` 前端零调用方（`src/app/api/export/route.ts`，GET :15）~~ → **撤案：保留，转待办**（2026-09-19 阿禅拍板"计入待办，以后要加"）
  - 留档证据: `rg -n "/api/export" src scripts tests` → 除路由自身与 `export-button.tsx:34` 外仅剩测试字符串；属可达数据出口的事实与收紧建议（NU-4 原文）已随 `docs/待办清单.md` P3"数据导出通道正式化"挂账，**正式重做时须一并处理权限+审计**。
  - 处置: 不删。`permission-architecture.test.ts:66` 条目保留。
- [x] A-25: ~~`ExportButton` 组件整文件死（`src/app/(app)/admin/export-button.tsx:10`）~~ → **撤案：随 A-24 保留**（导出功能正式重做时按新设计替换旧按钮，届时再删）
- [x] A-26: 限流死分支 `/api/auth/`（NextAuth 迁移残留）——2026-09-19 已删两处特判 + 两个测试断言同步删/改
  - 引用证明: `rg --files src/app/api/auth` 为空（无此路由；认证在 `/auth/callback`、`/auth/logout`）；`rg -n "startsWith\(\"/api/auth/\"\)" src/lib/api-rate-limit.ts src/lib/rate-limit.ts` → 仅 `api-rate-limit.ts:46`、`rate-limit.ts:81` 两处特判自身。
  - 删除范围: `src/lib/api-rate-limit.ts:46` 整行；`src/lib/rate-limit.ts:81` 中 `|| pathname.startsWith("/api/auth/")` 子句（该行保留 login/register 判断）。
  - 测试耦合（复核确认）: `src/lib/rate-limit.test.ts:124` 断言 `isRateLimitExempt("/api/auth/callback")===true`、`src/lib/api-rate-limit.test.ts:51` 断言 `isApiRateLimitExempt("/api/auth/login")===true` → **两处行为断言随特判同删/同改**；`rate-limit.test.ts:115` 的 readFileSync 守卫只断言"无 sort/展开"，不受影响。
  - 验证命令: `tsx --test src/lib/rate-limit.test.ts src/lib/api-rate-limit.test.ts` + `rg -n "/api/auth/" src/lib`（空）。

## 执行步骤

1. 确认前置：A-21 流量查证结论、BLK-4 冻结状态（A-22/24/25 已拍板撤案，不再需要其前置确认）。
2. 记录 BASE_SHA；只读 `npx tsc --noEmit` 留底。
3. 按 A-19→A-20→A-21→A-23→A-26 顺序删。
4. 同步修改 `membership-guard.test.ts`（删 :16/:18/:23 三条目，**:25 return 条目保留**）、`rate-limit.test.ts:124`/`api-rate-limit.test.ts:51`，同删 `orphan/route.test.ts`。
5. 运行验证命令（含定向 `npm test` 与全量 `npm test`）。
6. commit（不 push）：`cleanup: remove dead API routes with guard-test sync (batch 3)`。

## 验收标准

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过（membership-guard / rate-limit 全绿）
- [ ] rg 验证零引用：`rg -n "api/topics/(feishu-workspace|options)|sub-topics/.*claim[^s]|api/exemptions/orphan|startsWith\(\"/api/auth/\"\)" src scripts tests` 为空（return、/api/export、ExportButton 属拍板保留项，不在此列；URL 字符串样例测试若命中需逐条说明理由）

## 停止条件

运维确认 A-21 `/claim` 近 90 天有真实流量 → 该项停并记录；发现 membership-guard 之外新耦合 → 同批处理，不可留红测试进 commit。

## 回滚指令

`git reset --hard <BASE_SHA>`（本批前记录；无插入提交时为 `c0beeeed`）。
