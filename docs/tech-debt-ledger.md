# 技术债台账

本表只记录当前代码能直接证明、但本轮未伪装成已完成的项目。关闭前必须补对应测试或真实运行证据。

| 项目 | 证据 | 状态 | 下一步 | 阻断级别 |
|---|---|---|---|---|
| 方案 §2.2 五条旧数字 | [Phase 0 取证清单](reference/2026-10-02-架构方案Phase0取证清单.md)；当前基线、静态代码与浏览器门禁输出 | 部分收口：3 条已撤销，2 条待核实 | 按清单补真实调用点、双账号缓存切换和 route 错误处理逐项证据 | P1 |
| `gate:maintainability` 漏检未跟踪文件与已暂存文件 | `scripts/maintainability-gate.mjs` + `scripts/maintainability-gate.test.mjs` | 已完成 | 已覆盖干净、老/新文件未暂存与已暂存五态 | P1 |
| 选题服务兼容壳到期删除 | `src/lib/topics/service.ts` 已删除；调用方与测试已改指 `src/lib/topics/domain/`、`src/lib/topics/data/`、`src/lib/topics/group-matching.ts`；代码 `rg` 零命中 | 已完成（第五批） | 保留基线历史条目，不得恢复旧入口 | P1 |
| `src/lib/work-groups.ts`、`unified-command-hub.tsx` 超大/跨层 | 架构基线与可维护性方案 | 待施工 | 先补行为测试，再拆用例与呈现层 | P1 |
| `person-data.ts` 进程内缓存缺统一 TTL/容量指标 | `BoundedTtlCache`、`deleteByPrefix` 与 `person-data.test.ts` 定向测试（含旧请求不得删新在途条目、失效窗口内新请求可写入）；本轮未完成浏览器或集成层双账号切换实测 | **已完成（降级为观察项）** | 60s TTL / 64 条上限与用户隔离已有本地行为护栏，但页面级命中率、淘汰率和双账号切换仍未取证；对应 Phase0 清单第 88 行不翻勾 | P1 |
| 统一错误 / 有限重试 / 业务结果契约三个底座模块业务接入为 0 | `from "@/lib/..."` 非测试代码引用文件数实测：`errors`、`retry`、`operation-result` = 0；`timeout` 1、`cache-policy` 1、`request-context`/`observability` 各 2、`observed-mutation` 5 | 方案欠账（Phase 1 未走完） | 方案 §九 Phase 1 完成条件原文要求「至少在 dashboard、admin/content、审批链路真实接入并通过测试」；接入须按 Phase 2/3 逐链路做（改的是真实错误响应与重试行为），不与审批专项抢跑 | P1 |
| 审批/改判路由 `response ?? NextResponse.json(...)` 曾被判为死代码 | 删除后 `npx tsc --noEmit` 报 TS2322：`NextResponse<unknown> \| undefined` 不能赋给 `Response`；逐处恢复实验证明必需点 = `auth.response`（`requireAdminServiceClient` 推断类型中 `response` 可空，`in` 窄化后仍含 `undefined`） | **已撤销误判：非死代码** | 这些兜底同时承担类型收窄职责。全站同类写法 10 处（fulfillment 6 + exemptions 4，后者 09-17 `05ce246f` 即有）。**不要删；判「不可达」只能证明运行时不走，不能证明可删，动手前先跑 tsc** | P2 |
| 补交审批 10-03 起线上 500（函数重载歧义） | 生产迁移 `20261005101500` 已执行并登记；函数只剩 4 参版本，`anon` 无执行权；唯一 pending 申诉已真实驳回并落库理由，重复处理返回 `appeal already handled`。证据：[2026-10-05 补交审批迁移上线核对](reference/2026-10-05-补交审批迁移上线核对.md) | 已上线（REST RPC 入口另有 `appeal not found` 异常待查） | 另立任务排查 REST/PostgREST RPC 与直连函数行为差异；部署 SHA/Ready 与浏览器真实点击仍待核对 | P1 |
| 本地迁移账与函数对象不一致 | 本地 `schema_migrations` 已记 `20261003095010`，但 4 参函数对象不存在，导致角色门禁履约 5 条用例 400；需追 `supabase start`/`db reset` 是否跳过或部分失败 | 待核 | 每次本地 reset 后按迁移版本逐项对账 `schema_migrations` 与 `pg_proc`，禁止用删参数绕过真实函数缺失；将失败迁移日志留档 | P1 |
| 开发 worktree 仍引用已删兼容壳 | `.worktrees/stage6-b12`、`stage6-b14`、`stage6-b15`、`stage6-b17`、`stage7-p2-inventory` 仍命中 `topics/service`、`components/command-hub/types`、`admin/collaboration/_shared` | 合并前必做 | 各分支合并前统一改指 `src/lib/topics/{domain,data}`、`src/lib/command-hub/types`、`src/lib/collaboration/{domain,data}` 并逐分支跑类型检查 | P2 |
| 生产 RLS、真实角色、部署 SHA/Ready、恢复演练 | 本地无法证明 | BLOCKED | 取得生产只读与真实账号验收条件后复核 | P0 |
| 全站查询数/P95/连接池真实数据 | 当前基线仅静态扫描 | 待核 | 通过 observeOperation 接入真实请求采样 | P1 |
| 选题批量导入：批次台账计数失败观测仍使用 api-logger | `src/lib/topics/import.ts` 通过 `MutationObservation` 写入统一 mutation 观测；`src/lib/topics/import.test.ts` 真调失败路径并注入假 observation，保留 batchId/操作/错误/requestId 语义 | **已迁移** | 证据：`src/lib/topics/import.ts:451-467`、`src/lib/topics/import.test.ts:345-382`；`npx tsx --test src/lib/topics/import.test.ts` 通过 | P2 |
| 成员小队批量分配：Server Action 观测入口未收口 | `assignWorkGroupMembers` 已通过统一 `observeMutation` 记录批量结果，Server Action 只转发领域函数，不再直调 api-logger；保留结果码与部分成功语义 | **已迁移** | 证据：`src/lib/work-groups.ts:669-747`、`src/lib/work-groups.test.ts:593-639`；`npx tsx --test src/lib/work-groups.test.ts` 通过 | P2 |
| `gate:maintainability` 在工作区干净时无可拦项（发布节点自失明） | 第五批新增 `scripts/maintainability-terminal-check.mjs`＋`preflight:release` 固化顺序；**[QW] 10-05 按独立审查订正"已收口"为"部分收口"**：`terminalClear` 口径＝相对 `origin/main` 改动路径∩违规＝0，push 后干净检出仍恒绿——发布判定只认 push 前那次运行（流程约定），脚本级"提交区间对比"未实现 | 部分收口 | ①发布流程书面固定"push 前跑 preflight 留档"为唯一判定证据；②终态全勾需全站逐文件重扫核验（列入收官 S6）；③脚本级提交区间对比为可选增强 | P1 |
| 审批域三件契约件接入（阶段 3） | `route.ts` 非测试引用 `errors`/`retry`/`operation-result` 各 1 处；审批响应实测返回 `businessSucceeded`、`auditSucceeded`、`employeeNotificationSucceeded`、`notificationMarked` 分层字段；写接口不启用重试，超时/重试只包带 `abortSignal` 的审批申请读取 | 本地代码已接入，真实角色与浏览器九类验收待复跑 | 按方案 C §七、§八 完成真实权限、浏览器九类与施工前后指标对账；未有证据前不写阶段封板 | P0 |
| 审批/改判路由兜底口径修正 | 运行时不可达与类型不可删同时成立；`response ?? NextResponse.json(...)` 保留为类型收窄兜底，未删除、未改业务决策 | 口径已修正 | 后续同类判断必须先跑 `tsc` 再决定 | P2 |
| 统一错误 / 有限重试 / 业务结果契约当前口径修正 | 阶段 3 审批链非测试引用实测各 1 处，响应实测包含业务、审计、员工通知与待办分层字段 | 已修正 | 后续汇报统一写“底座已建 3 个、审批链接入 3 处”；全站其他链路仍按各阶段单独取证 | P1 |
| 审批试点返工：结果三态与单日志观测未收口（卡阶段 1 封板） | 实测 `route.ts` 仍有 `logAppealOutcome` 与 `observeMutation` 两条同 requestId 互斥记录；`operation-result.ts` 无 `skipped` 三态；驳回路径路由仍调 `writeAuditLog`（真实页面测得同一用户两条审计）；他人 `notificationId` 返回 500 而非安全 404；§7.1 两条行为缺单测 | 待施工 | 按 `docs/plans/2026-10-02-审批试点复审修复计划.md` §二 顺序 1→5 修复，修完由独立审查者回填 C §十 与总纲 §6.1 | P0 |
| 审批试点完成度自签已收回 | [CX] 在 `f6da6387` 将 C §十 自勾 8/12 并改写勾选纪律署名；[QW] 2026-10-02 20:57 按实测更正为 4/12 并恢复纪律 | 已处置 | 防复发：C §十 与本表均写明施工者不得自签封板，只认独立复跑证据 | P1 |
| 审批链指标前后对账缺真实采样 | 修复计划 §四：P95／5xx／审计失败率／通知失败率／markDone 失败率／重复审批率均无施工后数据；基线脚本为纯静态扫描 | 待核 | 隔离环境取得正式门禁退出码与采样后补入 C §八 与本行 | P1 |
| 架构基线存档滞后于当前代码 | 2026-10-05 重跑 `node scripts/architecture-baseline.mjs --report`，原文输出：`{"baselineDate":"2026-10-05","files":1093,"lines":160051,"routes":76}`；脚本同步写回 `scripts/architecture-baseline.json` / `.md`，两份存档与重跑结果一致 | **已重生成** | 本轮基线唯一读数；证据：`scripts/architecture-baseline.json`、`scripts/architecture-baseline.md`，命令退出码 0 | P1 |
| 线上域名未记录，push 后无法自查部署健康 | `docs/工程运行事实.md` §四已补录正式域名 `https://dydata.cc`，以及 push 后健康检查与 Vercel 首条 deployment 的 `meta.githubCommitSha` 对账命令 | **已补录** | 证据：`docs/工程运行事实.md:86-94`；本轮只补命令，未宣称已 push 或已完成线上核对 | P2 |
| 审批链未预期异常没有留痕（底座实现分叉） | 原证据同上 | **已处置（`baaf2919`，[QW] 23:30 实测）**：审批路由删除自建日志与响应体读取，簿记收回 `observeMutation`；该底座新增 `setDetail` 扩展点，`thrown` 态恢复并对异常也上报 Sentry；专测"依赖抛异常仍落一条 thrown 记录"通过（14/14） | 已关闭 | P1 |
| 审批九类场景在正式门禁里没有用例 | 第 8 类已由 `page.route`＋`route.fulfill` 假响应换成一次性本地 `pg_trigger` 真注入（`tests/roles/审批九类门禁端到端.spec.ts`），九类进正式 `gate:roles`；[QW] 2026-10-03 00:20 在隔离工作树亲跑 32 passed 退出码 0，只读查库确认残留测试触发器 0 | 已关闭 | 无需再动 |
| 5xx 口径混入"业务成功、后置失败"；`/api/action-center/summary` 无超时 | 口径已由 [QW] 定死并写入审批方案 §八：业务失败与业务成功后置失败分两层统计，通知/审计失败虽返回 500 但不得计入业务失败率。`summary` 路由实测无 `withTimeout`/abort 保护，2026-10-03 一次 `gate:browser` 首跑因它无响应失败、重跑才过 | 口径已定；超时待修 | 单独立项给 summary 加超时与降级，不得靠重跑消音 | P2 |
| 业务日按 UTC 记：上海每天 0—8 点「今天」无数据、每月 1 日 0—8 点发布管理整页空表 | [QW] 2026-10-03 实测：本地与生产 `show timezone=UTC`；`get_fulfillment_range` 定义含 `range_end := least(p_end_date, current_date)` 与 `if p_start_date > range_end then return`（整月判为未来即零行）；本地端到端复现同一查询改前 0 行、改后 6 行（整月 6→24 行），独立审查侧重跑种子得 0→3、6→9 —— **绝对行数随种子人数变，要看"改前必为 0 行"这个结构**；`pg_proc` 实测 12 个函数引用 `CURRENT_DATE` | **已受控上线生产**（阿禅拍板业务日=上海日历日）：迁移 `20261003020000_business_day_shanghai_timezone.sql` 单事务 psql apply（未用 db push），5 个函数 proconfig 由 `search_path=…` 变为 `search_path=…; TimeZone=Asia/Shanghai`，版本已登记；独立审查用 `pg_get_functiondef` 与仓库定义归一化比对确认**函数体逐字未改**，生产数据层以 10-03 为起始日返回 79 行（单团队 32 行），改前必为 0 行 | 界面层已用隔离 worktree + 忠实 HEAD 构建做负对照闭环（撤设置→矩阵日列 2 个且不含上海今天；恢复→3 个含 10-03），只剩"在生产域名上用真实账号看一次页面"：下一个 0—8 点窗口补，或安排一次带凭据的人工查看（本轮不使用他人账号脚本登录） | P1 |
| 函数级 `SET timezone` 会被函数重建静默丢掉 | 业务日收口用 `alter function … set timezone`（零重写，避免覆盖双向漂移的函数体）；本轮已在 `scripts/maintainability-gate.mjs` 增加新 migration 函数定义的 `CURRENT_DATE`/函数级 `SET timezone = Asia/Shanghai` 守卫，并以注入 migration 做红→补设置→0 证据 | **门禁已落地；生产对象未改** | 今后重建函数仍须在新定义里带上 `set timezone = 'Asia/Shanghai'`；本轮未执行生产 DDL，待 S5.3 对账后再按清单施工 | P1 |
| 7 个函数的「今天」只写在参数默认值里，函数级 SET 治不到 | 2026-10-05 生产只读盘点：7 个函数均存在且默认值含 `CURRENT_DATE`；6 个 `src` 非测试引用为 0、统计无行，`get_leaderboard_rows` 有 1 个现役调用且统计累计 114 次；完整定义与原始输出见 `docs/reference/2026-10-05-S5.3-生产函数只读盘点.md` | **已完成只读盘点，待 [QW] 对账** | 6 个暂列删除候选；`get_leaderboard_rows` 保留不动并只登记默认值重写候选。未执行生产删除/重建，不能标关闭 | P2 |
| 角色/浏览器门禁的"这个月有数据"依赖写死日期与浏览器时钟 | [QW] 2026-10-03：旧写法 `nowUtc.getUTCMonth()+1` + 种子写死 `2026-09/2026-10`，10 月 31 日后必然 0 成员假红；实测锚到 8 月还会因 `profiles.created_at <= range_end` 让 10-01 建的测试组长整人消失（≥2 塌成 1） | 已关闭 | 种子每次把锚点写入 `output/gate-roles-anchor.json`（gitignored），两份 spec 只消费；算式由 `scripts/seed-roles-test-data.test.ts` 注入"上海跨月凌晨"时刻回归，已纳入 `gate:static` 的 `scripts/*.test.ts`。后续日历类用例禁止再用 `new Date()` 推月份 | P2 |
| 门禁环境可被外部地址/错构建悄悄劫持（假红与假绿双向） | [QW] 2026-10-03 两起实测：①在门禁之外跑一次不带 `.env.ai-test.local` 的 `next build`，生产地址被编进浏览器包，3100 复用后三个角色页 500、写接口 403→500，4/4 全红；②只要设了 `DYDATA_E2E_BASE_URL`，Playwright 根本不启动本地服务端，用例对着外部哨兵照样"全绿"（假绿更危险，`reuseExistingServer:false` 只堵得住默认路径） | 已收口三层 | ① 新增 `scripts/assert-local-gate-env.mjs`：设外部地址必须显式 `DYDATA_GATE_ALLOW_EXTERNAL=1`（兼容并行线的 `DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY=1`），并强制门禁指向本地库；两个 playwright config 加载时即调用，`gate:roles` 也调用；**`run-browser-gate.mjs` 第一版只 import 未调用（等于死代码，且预检排在 build 之后），03:1x 独立审查打出、已修正为"预检先于 build 调用"，并补一条源码级断言防止再退化成只 import**；②`reuseExistingServer` 默认 false（要复用显式 `DYDATA_GATE_REUSE=1`）；③`run-role-gate-server.mjs` 启动前自断非本地库。行为由 `scripts/assert-local-gate-env.test.ts` 钉住（含"三个入口必须真的调用预检"与"锚点缺失时自动补跑 seed:roles"两条，后者是独立审查打出的第二缺陷：干净检出直接跑 `gate:browser` 会因缺 gitignored 的锚点文件硬失败）。**与并行线的 acceptance 拆分（`playwright.acceptance.config.ts`、`gate:browser:local`/`gate:accept:production`）是同一诉求，落地时合并成一个 guard，别留两套互相拦截** | P1 |
| 多会话共用同一个本地库与门禁端口，读数会互相污染（同一份代码两次跑差 11 条） | [QW] 2026-10-03 06:21 在 HEAD `cbe1f3ec` 跑全量 `gate:roles` → **21 passed / 11 failed**；同一提交号、同一台机器 06:31 重跑 → **32 passed 退出码 0**。期间另一会话正在提交 `src/`（06:18、06:20）并共用 `.env.ai-test.local` 指向的本地库，种子会删表重插、门禁服务端抢 3100 | 未收口（并发协作缺陷） | 三条建议：①`gate:roles`/`gate:browser` 开跑时打印并锁存 `git rev-parse HEAD`，跑完比对不一致就判"读数无效"；②并发会话按台账上一行约定分端口与分库（门禁专用库或每会话独立 Postgres 库）；③重要读数一律跑两次、且独占时段取数 | P1 |
| 阶段 7 第一波：契约路由缺行为级测试（原记 24，S2 盘点订正为 31） | S2 盘点（`docs/plans/2026-10-05-S2-契约行为测试清偿报告.md`）实测缺口＝31（8 字符串断言＋23 无）。**[QW] 10-05 隔离树复验关闭**：31/31 真行为测试（抽验认领链/group-mode/notifications/mark 真调 handler）、契约覆盖守卫注入实验通过（临时未接契约路由→守卫红→撤销→0，[QW] 亲跑）、video-submit 920→12 壳拆分等价；详见 `docs/reference/2026-10-05-1230-S2独立复验报告.md` | 已关闭 | 后续新增写入路由由守卫强制接契约或登记豁免；`route-core.ts` 951 行登记观察（再碰必先拆） | P1 |
| 阶段 7 第二波：流程债三条 | [QW] 2026-10-05 实测：①**第 2 波无口令提前启动**——派令 3 要求"P1a＋P1b 全部合入并经 [QW] 复验后"才开工，实际 P2 盘点 `b3e61da2`（00:46）与 P3 `b53c1f0c`（01:09）都早于第 1 波任何复验；②**拆笔纪律未执行**——P1a 出 12 笔（要求 7–9）、P1b 出 **1 笔**（要求 4–5），一笔 15 路由导致无法逐笔复验；③**验收指标不可能达标**——派令 1/2 要求 `gate:static` 退出码 0，但 `gate:maintainability` 对 `video-submit/route.ts`(920) 与 `member-lifecycle-service.ts`(832) 的超尺红在 2026-10-03 基线生成时已存在 | 口径已订正（派令文档加勘误节） | 派令 5（P4）开工前必须确认"前四批已 push 且线上核对通过"这条硬口令真被遵守，不得再滑 | P1 |
| 阶段 7 第二波：P3 交付缺口与角色矩阵环境依赖 | [QW] 2026-10-05 实测 `b53c1f0c`：①**service role 使用点盘点清单零产出**（派令 4 第 1 条要求"停下等 [QW] 对账"，实际未产出未停下，全仓 67 个文件在用 `createAdminClient`）；②**RLS 核验无原始 SQL 输出**；③**角色矩阵 spec 跑不起来**——读 `DYDATA_E2E_{MEMBER,LEADER,OWNER}_*` 且**不写 `DYDATA_TEST_*` 兜底**，是同目录 9 个 spec 里唯一例外，而 `.env.ai-test.local` 里正是 `DYDATA_TEST_*`，运行即抛错 | ③ 已修（主名称＋兜底＋缺凭据 `test.skip`）；① ② 已补齐 | 另有 5 条履约申诉用例在 P3 那轮 `gate:roles` 中返回 400，日志以"既有"带过未归因。新 spec 已加 `try/finally` 保证 group-mode 复位（原先断言中途失败会把"集团模式已开启"留给后续 spec）。**下次独占时段跑一次 `gate:roles` 复现确认**，仍失败则单独立项 | P0 |
| 生产库存在对未登录者开放的无条件读策略 | [QW] 2026-10-05 只读核验实测 `pg_policies`：`script_document` 的 `script_document_public_read`（`{public}`、`qual = true`、SELECT）与 `tag_definition` 的 `tag_definition_read`（`{public}`、`qual = true`、SELECT）。PostgreSQL 的 `public` **包含 `anon`**，即未登录者可读全表。**已收口（2026-10-05，阿禅拍板）**：按同类主数据（`teams` / `visual_tags` / `violation_case_visual_tags`）口径对齐为 authenticated-only，迁移 `supabase/migrations/20261005024700_narrow_anon_read_policies.sql` 单事务 psql apply 到生产（未用 `db push`）并登记版本 `20261005024700`；收口后两表均为 `roles={authenticated}` + `qual=true`，全库 `qual=true` 且 roles 含 `public` 的策略数由 2 归零。消费复核：`src/` 仅 `src/lib/ai/insight-period.ts:191` 登录态路径读 `tag_definition`，`script_document` 零引用 | 已收口 | — | P1 |
| 共享工作区的 `.next` 可能混入他人未提交代码，据此取得的"绿灯/红灯"都不忠实 | [QW] 2026-10-03 独立审查实测：02:27 那份构建里含有只存在于工作区、HEAD 里没有的 `markAppealTodosDone`，用它跑角色门禁会多红一类（第 5 类）；施工侧更早一次也被同类产物骗出 4/4 假红。**已关闭（2026-10-05）**：`scripts/gate-lock.mjs` 统一提供 `src/` 干净检查与 HEAD 锁存/收尾复核，`gate:roles` / `gate:browser` 均已接入；脚本回归覆盖 dirty-src 拒绝与 HEAD 变化判"读数无效"；`3100` 归门禁、其他会话使用 `32xx` 的约定已写入 `docs/工程运行事实.md`；指定的 `.worktrees/push-audit-a138eb02`、`.worktrees/push-audit-clean2` 经 `git worktree list` 核对不存在，未误删其他 worktree | 已关闭（2026-10-05） | 后续新门禁脚本必须复用 `scripts/gate-lock.mjs`，不得另造环境/并发守卫；取证仍优先在隔离 worktree 执行 | P2 |
|
 
端
到
端
测
试
用
假
响
应
冒
充
"
注
入
"
会
造
成
门
禁
假
绿
 
|
 
`
t
e
s
t
s
/
r
o
l
e
s
/
审
批
九
类
门
禁
端
到
端
.
s
p
e
c
.
t
s
:
2
8
6
`
–
`
:
2
8
9
`
 
用
 
`
p
a
g
e
.
r
o
u
t
e
`
＋
`
r
o
u
t
e
.
f
u
l
f
i
l
l
`
 
直
接
返
回
写
死
的
 
J
S
O
N
，
服
务
端
根
本
没
执
行
，
却
命
名
成
"
失
败
注
入
"
并
计
入
九
类
通
过
 
|
 
已
定
纪
律
 
|
 
凡
"
注
入
／
真
失
败
"
类
判
据
，
必
须
证
明
服
务
端
与
数
据
库
真
实
发
生
（
一
次
性
触
发
器
或
受
控
依
赖
故
障
）
＋
回
查
库
状
态
；
`
r
o
u
t
e
.
f
u
l
f
i
l
l
`
 
造
的
响
应
只
能
作
为
前
端
契
约
渲
染
证
据
，
两
类
不
得
混
写
。
纪
律
正
文
已
并
入
 
B
 
§
7
.
3
 
|
 
P
1
 
|
| 净零声明必须落在报告文件里 | 九类报告 JSON 只有 `gate/scope/localOnly/cases/category8Evidence` 五段，spec 里算出的 `remainingTestTriggers`（`:272`）没写进报告，所以"清理审计 7、申诉 9、通知 17、余量 0"这些数字当前无文件凭据；本轮由 [QW] 自跑并只读查库自行确认残留 0 | 待补 | 把清理计数与余量写入报告 JSON（或同目录 `cleanup.json`），并在报告里保留连接宿主＝127.0.0.1 的读数；凡口头净零一律不作为验收证据 | P2 |
| 门禁绿灯不覆盖类型：构建忽略类型错误 | `next.config.ts:18` `typescript.ignoreBuildErrors: true`（自 2026-06-28），因此 `gate:roles`/`gate:browser` 通过时仓库可能根本编译不过；2026-10-03 00:15 主工作区被并行会话未提交改动弄成 12 处 `TS2300/TS2304` 红，同树的角色门禁仍绿 | 已定纪律 | 验收记录要区分"门禁绿"与"类型绿"，只有 `gate:static` 的 `tsc` 能证明后者；接护栏那一步（阶段 6 前置）应顺带确认这条不被误当成全绿 | P2 |
| 审批线上健康度观察项（阶段 3 封板时转出的尾巴） | 起点已钉死：2026-10-03 00:44:53（Ready 时刻）起线上跑新版审批链（随并行推送上线）。第 9 条按两格判定：正确性格已由一次性 `pg_trigger` 真注入达成并经 [QW] 亲跑复现（`gate:roles` 32 passed、残留触发器 0）。**取数通道已被 [QW] 2026-10-03 01:58 实测否决**：Vercel 日志只保留最近约 1 小时，"改前 7 天"的 HTTP 对照永久不可回溯，上线后 63 分钟真实审批 0 条；可回溯的只有数据库（历史 20 次审批＝20 条审计，1:1 无重复）与 Sentry（只含异常）。详见 `docs/reference/2026-10-03-审批链线上核对.md` | 口径已改：原「人工查 Vercel 日志」假设作废 | **到期 2026-10-10 的报表按新口径出**：①数据库可算＝审批笔数、审计 1:1 率、结果通知 1:1 率、`fulfillment_appeals` 状态分布；②Sentry 可算＝审批路由异常条数；③HTTP 层＝一条真实审批的 `requestId` 定点抽查（须在上线后 1 小时内取数），核对无第二次 PATCH、三态如实、审计恰 1 行。放弃「P95/5xx 前后对照」这一格，除非另开日志外发。定点抽查需阿禅指定具体一条待处理申诉 | P2 |
| 同一改判动作两个入口结果不一致：履约管理页审批后待办不关，需再点一次「完成」 | [QW] 2026-10-03：服务端按 `source_type=fulfillment_appeal`、`source_id=appealId` 批量关闭全部 `unread/read` 同源待办；命中数写入 `observeMutation.detail.todoMarkedCount`，0 条保持 `todoStatus=skipped`，更新失败为 `failed`。本地真实浏览器从履约管理页点击一次通过：恰 1 次 POST、0 次 PATCH，刷新行动中枢待办消失；定向用例覆盖多条、0 条、失败三态。线上 9 条的来源已查清：同一批次由履约申诉 POST 按团队内 9 名可审批管理员各写 1 条，`notifications` 唯一键为 `(user_id,type,source_type,source_id)`，不是重试或重复提交。**[QW] 08:26 独立复验**：定向 17/17、`tsc` 0、`npm test` 1945/1945、`gate:static` 0、`gate:roles` 32/32 全部本会话自跑取绿；判据 3/4 施工方未留任何产物，由 [QW] 在隔离端口 3200＋本地库代做一次真实界面点击补齐（恰 1 次 POST／0 次 PATCH、2 条同源待办全关、审计与结果通知各恰 1 行、净零；留档 `output/qw-audit-fulfillment-todo/复现结果.json`）。三处残留：`todoMarkedCount` 无回归用例守护、~~九类门禁全部用 `page.evaluate` 打接口因而本路径零界面用例覆盖~~（**08:4x 已补**：新增 `tests/roles/履约管理页一次闭环.spec.ts` 进正式 `gate:roles`，真点按钮并记录这一次点击的全部请求；变异验证＝把服务端批量收口改回"不关"，该用例即报红 `todoStatus Expected "succeeded" Received "skipped"`，正是原缺陷症状）、"员工通知失败"分支只走显式 ID 不批量收口（该分支下第二个入口仍留待办） | 已收口（`75b1c862`、`7fc51927`；随 08:05 那批 `f14ee4e2..0213a759` 上线，见 `docs/reference/2026-10-03-0806-推送后线上核对.md`）。**[QW] 08:45 独立复跑**：`gate:roles` 33 passed 退出码 0（新用例真点按钮并计请求：1 次 POST／0 次 PATCH）、全量 `npm test` 1945/1945、生产只读复核＝同源待办 open 仅剩 80 条且全部属于 9 个 pending 申诉（陈旧 0）、176 条 done 的 `done_at` 与申诉 `handled_at` 逐条相等（176/176，未回填成清理时刻）、每笔已处理申诉审计最多 1 行；9 份提醒的来源在 `src/app/api/admin/fulfillment/appeals/route.ts:122-146` 查实＝按团队内可审批管理员各 1 条、唯一键含收件人。**仍欠一次生产真实点击复验**（08:05 上线后至 08:45 生产无任何审批请求） | **169 条陈旧待办已受控清理**（08:3x 阿禅当轮授权：单事务 psql、谓词命中数≠169 即抛错回滚、`UPDATE 169`、提交前复扫残留 0，改前逐行快照与回滚脚本见 `docs/reference/2026-10-03-审批链线上核对.md` §9.3.2）；清理后线上未完成待办行只剩 9 个 `pending` 申诉扇出的 80 条，属正常待办。本行引用的那条线上首笔改判申诉 `d341fb08…` 已于 02:27:46 被 `manual_reopen_fulfillment_appeal` 改回 `pending`、9 条待办全部回到 `unread`——**这次生产写在当日日志与本文原稿中均无记载，属留痕缺口** | P1 |
| 共享主干时推送未先通报，导致未经当轮授权的改动上线 | 2026-10-03 00:43 与 00:52 两次推送把本地全部提交带上远端，含审批链四笔代码提交（`681b4cb2`、`785bbe0c`、`baaf2919`、`58dd292f`）——本工程原计划「阶段 3 封板后由阿禅当轮确认再推」；提交内容本身已经复验，但「推线上」这一动作未经确认，也没做过推后健康核对。**同日 22:18/22:21 重演**：并行 ai-config 会话两次 push（`e33666ad`、`b6c6ed72`），后者祖先链含 [QW] 刚 ff 合入的 B09（`2d658fc1`），使 B09 未经当轮"逐笔声明"即上线；已补线上核对（`/api/health` 双 up），B09 系纯搬移零行为变化，风险面最小，不回滚 | 已立规矩（2026-10-03 02:25 阿禅点头，`AGENTS.md` §四 部署节新增两行：推送前逐笔声明将上线哪些提交＋推送后必须补线上核对并留档） | 规矩已落且**当日 23:05 走出正例**（逐笔声明→阿禅点头→[QW] push `b6c6ed72..f099fe55`→线上核对留档 `docs/reference/2026-10-03-2305-阶段6首批推送后线上核对.md`）；**阿禅已拍板流程加固：阶段 6 期间只允 [QW] push，其他窗口一律只 commit**（转达各窗口由阿禅执行） | 观察项：新规矩靠阿禅转达＋[QW] 每轮收尾核对 origin/main 是否被连带推进兜底；若再击穿升级为分支隔离（各窗口只提交到 feature 分支，[QW] 复验后统一合 main） | P1 |
| [QW] 自伤记录：脚本把字符串当元组迭代，写坏技术债台账 | 2026-10-03 01:30 我用批量改文档的脚本追加表格行时，`appends` 传成了字符串而非元组，逐字符各占一行，台账从 293 行膨胀到 556 行 | 已修复 | 已用提交版本整文件还原（`git show HEAD:docs/tech-debt-ledger.md`）再重新落两行；教训与既有纪律同条：**共享表格文件禁止用字符串拼接式脚本改，改完必须核行数与首尾各 3 行** | P2 |
| 门禁判据与脚本不一致：阻断线判据 1000、脚本实值 1200，且缺"活动度准入／路过必削／基线棘轮"三项机制 | 阿禅 2026-10-03 09:15 拍板，判据已写进 B 方案 §3.3 与 `docs/architecture-decisions/0006-拆分准入门槛与棘轮.md`；实测数据：>1000 有 12 个、>800 有 25 个（新增 13 个平均改动仅 23.6 次）、600–1000 行且改动 ≥45 次的有 4 个（导航栏 701/71 最典型）；发布管理页 10-02→10-03 从 2398 涨到 2699 行，证明"只拆不锁"会反弹 | 已收口（**[QW] 11:00 复验通过**；`a8837697` 追加的行级豁免机制 **[QW] 14:00 复验通过**——[QW] 自建临时 git 仓注入 7 项核心全对：无标记报红、行尾标记放行、空理由不放行、两处只标一处仍报红、`globalThis.Map` 无标记报红／带标记放行、豁免不外溢到尺寸判定；**`47f6cf03` 收紧两处漏洞后 [QW] 14:31 复验通过**：自建注入 11 项全符合预期——原漏洞①"代码＋标记顺带豁免下一行"与原漏洞②"字符串伪装标记"现均 exit 1，纯注释行标记 exit 0 未被误杀，自测 15/15，主工作树 `gate:static` 各环全过（1959/1959、scripts 9/9、tsc、lint、build 编译成功），红因仅剩两个超大文件的继承性改动） | `scripts/maintainability-gate.mjs` 已支持 `--base=<ref>`、1000 行阻断、活动度名单、路过必削与基线棘轮；基线清单为 `scripts/maintainability-baseline.json`，测试/类型/生成文件分栏。注入实测：1001 行新文件退出码 1、999 行退出码 0；700 行／90 天 45 次列入名单；>800 非名单文件加 1 行退出码 1、减 1 行退出码 0；基线加 1 行退出码 1；`node --test scripts/maintainability-gate.test.mjs` 7/7 退出码 0。阈值与三份 `allowRawMap` 白名单未放松。**[QW] 11:00 独立复验通过**：自建临时 git 仓注入 10/10（1001 阻断/999 放行、棘轮 +1 阻断、802 阻断 800 放行、漏基线 `missing-baseline` 阻断、基线额度上调 `baseline-file-increase` 阻断、并发取低值 695 阻断/690 放行、700 行×45 次进名单 `rule=activity`）；基线 40 条经脚本逐一核对＝每条等于当前真实行数（无放水额度）、>500 非名单文件 0 漏册、0 过期条目、名单 15 个与 B02–B17 批次表吻合；负对照 `--base=b08cc0aa` exit 1 恰抓 fulfillment-workbench/modules-content-v3/unified-command-hub 三个改过的 >1000 文件；`npm test` 1948/1948、`gate:static` 全链 exit 0、`gate:browser` 2 passed 1 skipped。**[QW] 14:00 追加两处实现漏洞（P2，下一笔门禁微批修）**：①"紧邻上一行"判定不要求该行是纯注释行，因此一行"代码＋标记"会顺带豁免紧邻下一行的未标记命中（[QW] 注入实测 exit=0）；②字符串字面量里写 `"// gate:transient-map 理由"` 冒充上一行标记同样能豁免（实测 exit=0）。修法＝上一行必须匹配 `^\s*//` 才算标记，并补两条注入用例。**主干当前另有 3 处报红与阶段 6 两批无关**：全部由并行提交 `86b97f9f` 造成（form-v2 3258→3266、panel-v2 1078→1105 触发 >1000 改动阻断；审批 `appeal/handle/route.ts` 528→530 触发棘轮）；以 `86b97f9f` 为基座时只剩 route.ts 一处——**棘轮与基座无关，push 也消不掉，必须在 push 前把该文件削到 ≤528**（已由 `47f6cf03` 收口：只把 `actionUrl` 三元从 3 行收拢为 1 行，文案／参数／条件未动、未删注释，530→528）；**【ADR0007 施工，[QW] 16:30 复验通过】**（`248dd3b9`：基线 40→54 条＝14 个在榜文件各记当前行数，`topics/service.ts` 兼容出口已出榜故不登记；脚本两处判定＝`blocking-file-size` 仅对无上限记录者"改动即拦"、棘轮分支去掉名单内豁免、`route-must-shrink` 豁免保留，阈值/白名单/Map 豁免机制未动。 [QW] 自建注入 8 项＋上轮 Map 豁免 11 项回归全部符合预期；基线审计＝14 条新上限逐一等于真实行数、原 40 条零改动、无幽灵条目；自测 21/21、tsc 0、`npm test` 1965/1965、主工作树 `gate:static` 各环全过，**红因从 3 条降到 1 条**）。[QW] 已按 0007 第 4 条把 `service.test.ts` 上限随实际缩减同步下调 954→939。**【最后 1 条红，待阿禅拍板】** `ocr-screenshot/route.ts` 551→557：截图识别会话 `397a040f` 超时必要修复（Vercel `maxDuration=60` 声明＋`totalTimeoutMs` 参数＋两段理由注释，全是承重墙、无排版肥肉可削），撞上名单外文件的 551 棘轮。[QW] 建议：把 0007 原则延伸到名单外棘轮——**上限只许复验方在"核实为必要修复并台账登记"后上调，施工方上调仍一律拦**；本案核实后 551→557，门禁即全绿可 push。不点头则需截图识别会话自行削 6 行，或接受主干长期红 | P1 |
| B02 施工用 `new globalThis.Map` 绕开 raw-Map 探测，另含两处防线缩水与整文件重排版 | `9876b602`：拆分前 `service.ts` 有 15 个 `new Map`，拆分后 domain/data 内 plain `new Map` ＝ 0、`new globalThis.Map` ＝ 15（一比一对应，全仓无此写法先例）；[QW] 实测门禁正则 `/new\s+Map\s*[<(]/` 对 `new globalThis.Map(` 返回 false（`node -e` 可复现）→ **该探测对这 22 个文件永久失明**。根因是门禁对"搬迁"误报（搬迁必然产生新增行，`addedRawMapPaths` 一律命中），施工方选择改代码绕过而非上报。**同类两处**：①`service.test.ts` 结构契约锚点从读整个 service.ts（覆盖 4 处阈值比较）缩为只读 `domain/ranking.ts`（覆盖 1 处，`domain/query-options.ts:106`、`data/pool-scored.ts:22/95` 失去防回潮，而该测试自己的注释写着"删掉它就等于失去防回潮能力"）；②`data/pool-scored.ts:69` 删掉冗余的 `applyScope` 二次过滤（当前 SQL 已按 scope 过滤，行为等价，但防线变薄）。另：注释 53→13 行（含 2026-08-26／08-30 决策注释与"content 一并取出省一次全表扫描"）、链式调用压成单行，1995→1477 行的"瘦身"里约 500 行来自重排版而非拆分，使分层尺失真 | 已收口（**[QW] 14:00 返工复验通过**，全部自跑：15 处标记逐条核过确为函数体内局部量；锚点覆盖面经 [QW] 分别注入 `>= 30_000` 实测 ranking／query-options／pool-scored 三处都能拦；`applyScope` 收敛为 `domain/internal.ts` 单一定义且 pool-scored 二次过滤已恢复；54 个顶层函数抹空白比对语义零变化（`get→has`、比较器、返回类型注解等改写均已还原）；出口 67=67；旧注释 53 条由 [QW] 代做还原补齐至 53/53；tsc 0、`npm test` 1957/1957、`gate:browser` 2 过 1 跳） | ①15 处 `globalThis.Map` 改回 `new Map`；②锚点扩读含阈值比较的三个文件（ranking＋query-options＋pool-scored）；③恢复被删的决策注释并取消压行重排（目录结构与出口不动）。**前置**：raw-Map 探测需要一个合法出口，否则①改回去门禁立刻红。推荐"行级豁免注释 `// gate:transient-map 函数内临时量`＋[QW] 复验逐条核对"，需阿禅拍板后由 Codex 实现并补注入用例（无注释的 `new Map` 仍须报红）；备选＝探测收窄为仅模块级 `new Map`（会漏延迟初始化的模块变量）；不推荐＝把这批文件塞进 `allowRawMap`（整文件豁免＝白名单当垃圾桶）。（→ 该方案已于 `23c96c67` 全部落地并经 [QW] 复验，此列保留原始方案作档案） | P1 |
| OCR 路由存量上限上调（551→557）——复验方依 ADR0007 延伸条款办理的首个案例 | 截图识别会话 `397a040f`（识别超时 20→45 秒、整链预算 30→60 秒）使 `src/app/api/ocr-screenshot/route.ts` 净增 6 行，撞上其 551 行存量上限，主干 `gate:static` 因此差一步全绿。[QW] 逐行核实净增内容＝Vercel `maxDuration=60` 平台函数上限声明、`totalTimeoutMs` 新参数、两段决策注释，全部为承重内容、无排版肥肉可削；施工方报告真图集成 3/3 通过（10–16 秒） | 已收口（2026-10-03 16:40 阿禅拍板延伸条款，[QW] 上调 551→557 并于此登记；门禁即全绿） | 后续任何名单外文件的同性质增长沿用此通道：施工方上调一律拦，复验方核实必要＋本表登记后方可上调；每次上调必须能说出"删哪一行会丢什么知识" | P2 |
| 阶段 6 拆分批次引入 `eslint-disable react-hooks/exhaustive-deps` 共 6 处（B05×5、B13×1），依赖检查长期关闭 | [QW] 复验实测：B05 在 `lib/topics/data/hub.ts`/`hub-actions.ts` 等新增 5 对行级抑制（`--no-inline-config` 验证：去掉会冒 5 条 exhaustive-deps 警告）；B13 在 `src/lib/topics/data/work-breakdown.ts:19` 新增 1 条**整文件**抑制（比行级更宽）。根因同一个：拆分时把整个 `state` 对象当袋子传进数据层 hook，静态分析看不透"哪些成员是稳定的 setState/ref"，只能关检查。行为无影响（搬移逐字等价已核），但这些回调的依赖正确性从此没有工具兜底 | 已收口（2026-10-04 [CC] 独立审查通过并 push 上线，生产提交 `2418334c`：6 条抑制全部删除、按需传值字段集合与原解构逐一相等、依赖扩充值全为稳定 setter/ref、`--no-inline-config` 7 文件 0 报错、patch-id 核实 rebase 前后补丁一致、`npm test` 1991/1991、生产选题库列表/筛选/拆解抽屉真实加载无异常；留档 `docs/reference/2026-10-04-1830-D1债务消解推送后线上核对.md`） | 后续批次（或单独立项）把 state 整袋传参改成按需传值（只传真正用到的字段与稳定 setter），消解后删除全部抑制注释；新增拆分批次**禁止**再引入同类整文件抑制；`TopicPoolExplorer` 死兼容出口与 `getErrorMessage` 两处重复随同清扫 | P2 |
| [QW] 自伤记录：收官留档笔夹带并行会话暂存的 API 路由删除上线 | 2026-10-04 18:4x，push 收口批时我的第二笔提交 `0d9b217e`（docs 留档）用 `git commit <精确文件>` 提交，但并行 ai-config 会话已把"删除 `src/app/api/admin/ai-config/model-families/route.ts`（112 行）"暂存进共享 index，删除随我的提交一并 push 上线；前端 `model-family-select.tsx:29` 仍 fetch 该 URL、替代实现（`availability.ts`）未提交——线上模型家族下拉断了一小段时间（约 18:45–18:47） | 已止血（`0664251d` 恢复该路由并 push，部署 READY 确认、route 401 鉴权墙正常、health 双 up；订正见 `docs/reference/2026-10-04-1850-阶段6拆分线收官推送后线上核对.md` §四） | **纪律补条**：共享工作树里 `git commit <精确文件>` 不等于 index 纯净——他人已暂存的删除/新增若路径落入提交范围会被一并扫入。commit 前必须 `git diff --cached --stat` 全量核对 index，发现非本会话暂存项先 `git restore --staged <路径>` 再提交；push 后必须逐笔 `git show --stat` 复核实际内容。并行会话若确要删该路由，须与前端调用方改造同批提交 | P1 |
