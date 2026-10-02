# 技术债台账

本表只记录当前代码能直接证明、但本轮未伪装成已完成的项目。关闭前必须补对应测试或真实运行证据。

| 项目 | 证据 | 状态 | 下一步 | 阻断级别 |
|---|---|---|---|---|
| 方案 §2.2 五条旧数字 | [Phase 0 取证清单](reference/2026-10-02-架构方案Phase0取证清单.md)；当前基线、静态代码与浏览器门禁输出 | 部分收口：3 条已撤销，2 条待核实 | 按清单补真实调用点、双账号缓存切换和 route 错误处理逐项证据 | P1 |
| `gate:maintainability` 漏检未跟踪文件与已暂存文件 | `scripts/maintainability-gate.mjs` + `scripts/maintainability-gate.test.mjs` | 已完成 | 已覆盖干净、老/新文件未暂存与已暂存五态 | P1 |
| `src/lib/topics/service.ts` 超过阻断线 | 架构基线 `structure.filesOver1000Lines` | 待施工 | 按领域拆分并保留兼容出口 | P1 |
| `src/lib/work-groups.ts`、`unified-command-hub.tsx` 超大/跨层 | 架构基线与可维护性方案 | 待施工 | 先补行为测试，再拆用例与呈现层 | P1 |
| `person-data.ts` 进程内缓存缺统一 TTL/容量指标 | `BoundedTtlCache`、`deleteByPrefix` 与 `person-data.test.ts` 定向测试（含旧请求不得删新在途条目、失效窗口内新请求可写入） | 已完成（浏览器回归未做） | 60s TTL / 64 条上限的页面级命中率与淘汰率未做浏览器验证，降级为观察项；如需再补一次协作档案页回归 | P1 |
| 统一错误 / 有限重试 / 业务结果契约三个底座模块业务接入为 0 | `from "@/lib/..."` 非测试代码引用文件数实测：`errors`、`retry`、`operation-result` = 0；`timeout` 1、`cache-policy` 1、`request-context`/`observability` 各 2、`observed-mutation` 5 | 方案欠账（Phase 1 未走完） | 方案 §九 Phase 1 完成条件原文要求「至少在 dashboard、admin/content、审批链路真实接入并通过测试」；接入须按 Phase 2/3 逐链路做（改的是真实错误响应与重试行为），不与审批专项抢跑 | P1 |
| 审批/改判路由 `response ?? NextResponse.json(...)` 曾被判为死代码 | 删除后 `npx tsc --noEmit` 报 TS2322：`NextResponse<unknown> \| undefined` 不能赋给 `Response`；逐处恢复实验证明必需点 = `auth.response`（`requireAdminServiceClient` 推断类型中 `response` 可空，`in` 窄化后仍含 `undefined`） | **已撤销误判：非死代码** | 这些兜底同时承担类型收窄职责。全站同类写法 10 处（fulfillment 6 + exemptions 4，后者 09-17 `05ce246f` 即有）。**不要删；判「不可达」只能证明运行时不走，不能证明可删，动手前先跑 tsc** | P2 |
| 生产 RLS、真实角色、部署 SHA/Ready、恢复演练 | 本地无法证明 | BLOCKED | 取得生产只读与真实账号验收条件后复核 | P0 |
| 全站查询数/P95/连接池真实数据 | 当前基线仅静态扫描 | 待核 | 通过 observeOperation 接入真实请求采样 | P1 |
| 选题批量导入：批次台账计数失败观测仍使用 api-logger | `src/lib/topics/import.ts` 已记录 batchId/操作/错误/requestId，待统一结果契约底座收口 | 待迁移 | 统一观测底座完成后迁移到统一结果契约 | P2 |
| 成员小队批量分配：Server Action 观测入口未收口 | 当前通过 `api-logger` 在 Server Action/领域函数记录批量结果，尚未接入统一 mutation 观测 | 待迁移 | 统一 Server Action 观测入口落地后迁移并保留结果码 | P2 |
| `gate:maintainability` 在工作区干净时无可拦项（发布节点自失明） | [QW] 2026-10-02 实测 `--report`：`changedPaths=0`、`untrackedPaths=0`、`legacyViolations=66`、`status=pass`；判定只取"本次改动路径 ∩ 违规"，提交完成即脱离视野 | 未收口 | 在门禁接入 CI 或发布链路之前，必须支持指定对比基线（如 `--base=origin/main` 或由 CI 传入提交区间），否则干净检出永远绿灯；在那之前**不得把本门禁写进任何发布判定证据** | P1 |
| 审批域三件契约件接入（阶段 3） | `route.ts` 非测试引用 `errors`/`retry`/`operation-result` 各 1 处；审批响应实测返回 `businessSucceeded`、`auditSucceeded`、`employeeNotificationSucceeded`、`notificationMarked` 分层字段；写接口不启用重试，超时/重试只包带 `abortSignal` 的审批申请读取 | 本地代码已接入，真实角色与浏览器九类验收待复跑 | 按方案 C §七、§八 完成真实权限、浏览器九类与施工前后指标对账；未有证据前不写阶段封板 | P0 |
| 审批/改判路由兜底口径修正 | 运行时不可达与类型不可删同时成立；`response ?? NextResponse.json(...)` 保留为类型收窄兜底，未删除、未改业务决策 | 口径已修正 | 后续同类判断必须先跑 `tsc` 再决定 | P2 |
| 统一错误 / 有限重试 / 业务结果契约当前口径修正 | 阶段 3 审批链非测试引用实测各 1 处，响应实测包含业务、审计、员工通知与待办分层字段 | 已修正 | 后续汇报统一写“底座已建 3 个、审批链接入 3 处”；全站其他链路仍按各阶段单独取证 | P1 |
| 审批试点返工：结果三态与单日志观测未收口（卡阶段 1 封板） | 实测 `route.ts` 仍有 `logAppealOutcome` 与 `observeMutation` 两条同 requestId 互斥记录；`operation-result.ts` 无 `skipped` 三态；驳回路径路由仍调 `writeAuditLog`（真实页面测得同一用户两条审计）；他人 `notificationId` 返回 500 而非安全 404；§7.1 两条行为缺单测 | 待施工 | 按 `docs/plans/2026-10-02-审批试点复审修复计划.md` §二 顺序 1→5 修复，修完由独立审查者回填 C §十 与总纲 §6.1 | P0 |
| 审批试点完成度自签已收回 | [CX] 在 `f6da6387` 将 C §十 自勾 8/12 并改写勾选纪律署名；[QW] 2026-10-02 20:57 按实测更正为 4/12 并恢复纪律 | 已处置 | 防复发：C §十 与本表均写明施工者不得自签封板，只认独立复跑证据 | P1 |
| 审批链指标前后对账缺真实采样 | 修复计划 §四：P95／5xx／审计失败率／通知失败率／markDone 失败率／重复审批率均无施工后数据；基线脚本为纯静态扫描 | 待核 | 隔离环境取得正式门禁退出码与采样后补入 C §八 与本行 | P1 |
| 架构基线存档滞后于当前代码 | 存档 `scripts/architecture-baseline.json` 为 `generatedAt=2026-10-02T08:05:56Z`、`files=893/lines=143487`；[QW] 21:20 亲跑 `node scripts/architecture-baseline.mjs` 实际输出 `files=894/lines=144374`（脚本无 `--report` 分支，运行即无条件写回 `.json`/`.md`，跑完须回退或提交） | 待重生成 | 阶段 6 开工前重跑一次并把两份存档一并提交，作为"施工前基线"唯一读数；此后一切前后对账只引用该日期版本 | P1 |
| 线上域名未记录，push 后无法自查部署健康 | [QW] 2026-10-02 21:35 推 5 笔文档后想核验：仓库无 Vercel CLI、`.vercel/project.json` 不含域名、`工程运行事实`/`README`/`.env.example` 均未记录正式访问地址，只有 `/api/health?check=supabase` 的探测约定 | 待补一行事实 | 把正式域名与"push 后核健康"的现成命令补进 `docs/工程运行事实.md` §四，让任何 agent 推完能自己确认没把线上推坏 | P2 |
| 审批链未预期异常没有留痕（底座实现分叉） | `785bbe0c` 实测：`route.ts` 的 POST 尾部无兜底 try/catch，`handleAppealRpc`(:300) 与 `emit`(:350) 一旦抛异常就整个请求外抛，零结构化记录、零 Sentry、无 `x-dydata-request-id`；原 `observeMutation` 的 `thrown` 态（`observed-mutation.ts:23`、`:142`）在审批链丢失；审批路由只 `import type { MutationStage }`，outcome 映射（`route.ts:448`）、requestId 头、耗时统计各重写一份；审批测试集内 `throw` 零命中，该路径完全无测 | 待施工 | 恢复异常兜底并把簿记收拢回 `observeMutation`（给它加 detail/decorate 扩展点），补一例"依赖抛异常仍落一条 thrown 记录"的定向测试；补完即可封阶段 1 | P1 |
| 审批九类场景在正式门禁里没有用例 | `grep 补交|申诉|appeal tests/` 只命中"发布时间与补交门禁端到端"与"日报提交成功态"，均非审批卡九类；交付引用的 `/tmp/drawer-screenshots/` 经核是个人档案与抽屉交互验收截图（01-personal-card-672px.png 等），与审批无关；唯一一份审批九类外部报告验的是 `f6da6387`，早于本次三态改动 | 待施工 | 把 C §7.3 九类做成可重跑的 `gate:roles`/`gate:browser` 用例，至少含重复审批、审计/通知失败、他人 `notificationId` 三类注入，并交报告与截图路径 | P1 |
| 5xx 口径混入"业务成功、后置失败"；`/api/action-center/summary` 无超时 | `EMPLOYEE_NOTIFICATION_FAILED` 经 `errors.ts:statusForCode` 映射为 500，因此通知失败会计入 5xx；本轮 `gate:browser` 首跑因该 summary 接口无响应失败、重跑后通过，实测该路由无 `withTimeout`/abort 保护 | 待核 | 指标对账前先定口径（按 `businessSucceeded` 拆业务失败与后置失败两层）；summary 超时问题单独立项修复，不得靠重跑消音 | P2 |
