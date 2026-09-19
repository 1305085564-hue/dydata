# DYData 清理执行清单（cleanup-batches）

> 状态：**待阿禅逐批审核签字，尚未执行任何删除**。本目录只是执行文档，不是执行记录。
> 来源：`/private/tmp/dydata-full-cleanup-scan-2026-09-19.md`（只读扫描报告，基线 `main @ d93b0ab`）。
> 本清单基线：2026-09-19 对 `main @ c0beeeed` 磁盘状态逐项复核，所有行号以复核后为准。

## 与扫描报告的差异（复核结论，先读这里）

扫描报告之后，仓库已有 5 个提交落地（`05066dd1` 死前端清理、`45d6e704` 中间件/脚本清理、`08aa42c2` 规则对齐、`d8c74d4d` 配额权限修复、`c0beeeed` 文档记录），导致：

**已在先前提交中完成、本清单不再列执行项的**：
A-01、A-02（含 test 与 CSS 选择器残留，已清零）、A-03（`getNavItems` 已删，`GetNavItemsInput` 为活代码保留）、A-04、A-05、A-06、A-08（step/animationDelay/issueCount/onClaim 全部已清）、A-09 大部分（仅剩 `streamRewriteChat`）、A-27（`/violations` 已从 middleware 移除）、A-29（`perf:ttfb` 脚本条目已删）、A-30（`/demo` 重定向已删）、A-33（空目录已回收）；文档侧 F-DOC-1、F-DOC-2、F-DOC-4、F-DOC-6 已更正。

**对报告结论的三处修正（本次磁盘复核）**：

1. **A-14 误报，不删**。`TopicPoolExplorer` 被 `TopicHubV2.tsx:32` 直接 import，`TopicWorkBreakdownDrawer`/`TopicMoreFiltersDrawer` 被其 `dynamic(() => import())` 挂载（`TopicHubV2.tsx:38-46`，使用于 `:623/:680/:734`），而 `topics/page.tsx:80` 渲染 `TopicHubV2`。报告的"零生产引用"是 grep 漏掉动态 import 所致（§7 已自我警告过的盲区）。NU-3 据此关闭。连带影响：A-13 的 `DETAIL_PAGE_SIZE` 有生产消费方，迁移方案照做但"抽屉可能一起删"的前提不再成立。
2. **NU-2 基本可关闭**。`rg "\bsubmitExemptionRequest\b" src scripts tests` 复核：admin 版（`admin/actions.ts:392`）零 importer，全部消费方（`video-submit-panel-v2.tsx:34`、`申请豁免弹窗.tsx:17`）import 的都是 dashboard 版。定性为重复定义可删，删除前仍须后端签字确认写路径收口。
3. **A-21 耦合更正**。claim/return 路由在磁盘上**没有** `route.test.ts`（报告所述与磁盘不符），唯一测试耦合是 `src/app/api/topics/membership-guard.test.ts`（`readFileSync` 断言，条目 `:16/:18/:23/:25`）。`api-path-validation.test.ts` 仅用 URL 字符串样例，不读文件、无需改。另 `handlers.ts` **不可整体删除**：`buildPersonResponse`/`buildAttributionResponse`/`buildUnattributedResponse` 仍被活路由使用。

**仍在途的阻断（BLK-4 复核确认真实）**：`src/lib/team-join/service.ts(+test)` 未提交；`supabase/migrations/20260916*、20260918*、20260919*` 权限迁移未跟踪。涉及豁免写路径的批次（批次 2、批次 4 的 A-12）必须等其落地或冻结。

## 文件索引与执行顺序

| 文件 | 内容 | 优先级 | 前置 |
|---|---|---|---|
| `batch-1.md` | 纯前端零引用收尾（A-07 残项、A-09 残项） | P1 | BLK-5 |
| `batch-2.md` | 攻击面收敛：死 server actions + collaboration 死 handler/路由（A-15~A-18） | **P0** | NU-2、BLK-4、后端+权限 owner 签字 |
| `batch-3.md` | 死 API 路由 + 测试同步（A-19~A-26） | P1 | NU-4、A-21/22 线上流量查证、membership-guard 同步 |
| `batch-4.md` | 死集群 + 迁移兜底（A-10~A-13；A-14 已修正为不删） | P2 | NU-1、后端迁移完成度确认 |
| `batch-5.md` | 中间件/配置死项（A-28、A-31、A-32） | P2 | A-28 需构建 owner 签字 |
| `batch-6.md` | 文档更正（F-DOC-3/5/7/8、A-34） | P2 | F-DOC-2 口径已统一，无需再动 |
| `unconfirmed.md` | NU-1~NU-8 核查清单（含已关闭项的关闭依据） | — | — |
| `deferred.md` | B 类（需确认）与 D 类（架构收口，批次 7）暂缓清单 | — | — |

建议顺序：**批次 2 → 1 → 3 → 4 → 5 → 6**（批次 2 因涉及可达死写入口=攻击面，优先于普通死代码；批次 1 剩余量已极小，跟着做掉即可）。批次间不混做，一批一 commit。

## 全局前置总则（任何一批执行前）

> **2026-09-19 阿禅授权例外**：批次 1、批次 6 与批次 5 的 A-31/A-32（纯代码/文档，不触数据库、不触构建产物）**可先行执行，无需等阶段 0**；其余批次仍以下列总则为闸。

1. **BLK-1**：凡触碰 RLS/trigger/policy 的对象，不得凭 repo grep 判死，须线上 `pg_policy/pg_proc/pg_depend` 实测（本清单六批已刻意避开 RLS 对象，若执行中发现牵连立即停）。
2. **BLK-2**：`supabase/migrations/` 整目录冻结禁动（链不可重放 + 补丁游离）。
3. **BLK-4**：先让 team-join 与 b3 权限迁移落地或明确冻结。
4. **BLK-5**：每批动手前先跑一次只读 `npx tsc --noEmit` 复验。
5. **BLK-6**：`/api/feishu/event`、`/api/supabase-keepalive`、`/api/notifications/cleanup`、`/api/health` 等外部/调度触发入口永不判死。
6. **测试耦合总则**：全仓 59 个测试用 `readFileSync(路径)` 读源码/SQL 做断言、17 个读迁移 SQL。删任何文件前必须先 `rg -l "<文件名或路径片段>" src --glob '*.test.*'` 自查，同批修断言，否则测试红于 ENOENT。
7. **提交纪律**：默认只 commit 不 push main（AGENTS.md:125 现行口径：push 前须当前轮明确授权并核对 SHA）。

## 成功标准（整体）

- 六批全部完成后：`npx tsc --noEmit` 通过、`npm test`（`tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`）通过、`gate:static` 通过、每批验收命令的 `rg` 复验为空、每批一个可独立回滚的 commit。
- 过程中：零误删（每批停止条件触发即停并回滚，不"顺手"扩大删除范围）。
- B 类与 D 类不混入本清单执行：B 类转 `unconfirmed.md`/`deferred.md` 的确认流程，D 类按批次 7 专项立项。
