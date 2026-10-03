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
| 审批链未预期异常没有留痕（底座实现分叉） | 原证据同上 | **已处置（`baaf2919`，[QW] 23:30 实测）**：审批路由删除自建日志与响应体读取，簿记收回 `observeMutation`；该底座新增 `setDetail` 扩展点，`thrown` 态恢复并对异常也上报 Sentry；专测"依赖抛异常仍落一条 thrown 记录"通过（14/14） | 已关闭 | P1 |
| 审批九类场景在正式门禁里没有用例 | 第 8 类已由 `page.route`＋`route.fulfill` 假响应换成一次性本地 `pg_trigger` 真注入（`tests/roles/审批九类门禁端到端.spec.ts`），九类进正式 `gate:roles`；[QW] 2026-10-03 00:20 在隔离工作树亲跑 32 passed 退出码 0，只读查库确认残留测试触发器 0 | 已关闭 | 无需再动 |
| 5xx 口径混入"业务成功、后置失败"；`/api/action-center/summary` 无超时 | 口径已由 [QW] 定死并写入审批方案 §八：业务失败与业务成功后置失败分两层统计，通知/审计失败虽返回 500 但不得计入业务失败率。`summary` 路由实测无 `withTimeout`/abort 保护，2026-10-03 一次 `gate:browser` 首跑因它无响应失败、重跑才过 | 口径已定；超时待修 | 单独立项给 summary 加超时与降级，不得靠重跑消音 | P2 |
| 业务日按 UTC 记：上海每天 0—8 点「今天」无数据、每月 1 日 0—8 点发布管理整页空表 | [QW] 2026-10-03 实测：本地与生产 `show timezone=UTC`；`get_fulfillment_range` 定义含 `range_end := least(p_end_date, current_date)` 与 `if p_start_date > range_end then return`（整月判为未来即零行）；本地端到端复现同一查询改前 0 行、改后 6 行（整月 6→24 行），独立审查侧重跑种子得 0→3、6→9 —— **绝对行数随种子人数变，要看"改前必为 0 行"这个结构**；`pg_proc` 实测 12 个函数引用 `CURRENT_DATE` | **已受控上线生产**（阿禅拍板业务日=上海日历日）：迁移 `20261003020000_business_day_shanghai_timezone.sql` 单事务 psql apply（未用 db push），5 个函数 proconfig 由 `search_path=…` 变为 `search_path=…; TimeZone=Asia/Shanghai`，版本已登记；独立审查用 `pg_get_functiondef` 与仓库定义归一化比对确认**函数体逐字未改**，生产数据层以 10-03 为起始日返回 79 行（单团队 32 行），改前必为 0 行 | 界面层已用隔离 worktree + 忠实 HEAD 构建做负对照闭环（撤设置→矩阵日列 2 个且不含上海今天；恢复→3 个含 10-03），只剩"在生产域名上用真实账号看一次页面"：下一个 0—8 点窗口补，或安排一次带凭据的人工查看（本轮不使用他人账号脚本登录） | P1 |
| 函数级 `SET timezone` 会被函数重建静默丢掉 | 业务日收口用 `alter function … set timezone`（零重写，避免覆盖双向漂移的函数体）；Postgres 的 `CREATE OR REPLACE FUNCTION` 会连同函数级 SET 一起替换 | 未收口（纪律项） | 今后任何人重建这 5 个函数（`get_fulfillment_range`、`get_fulfillment_calendar`、`get_today_submission_status`、`set/clear_permanent_exemption_owner_atomically`）必须在新定义里带上 `set timezone = 'Asia/Shanghai'`；建议在可维护性门禁加一条"函数定义含 CURRENT_DATE 且无 Asia/Shanghai 设置即拦" | P1 |
| 7 个函数的「今天」只写在参数默认值里，函数级 SET 治不到 | 实测参数默认值在调用者上下文求值；这 7 个（`admin_cockpit_summary(_v2)`、`admin_pending_submissions_today(_v2)`、`admin_pending_videos_today`、`admin_sidebar_badges_summary`、`get_leaderboard_rows`）在 `src` 非测试代码引用数为 0，`get_leaderboard_rows` 调用方显式传 `since_date` | 待清理专项一并决定 | 归入死 RPC/默认值清理：要么删掉无人调用的对象，要么重写签名改默认值（重写须按线上定义并保留 `TimeZone` 设置） | P2 |
| 角色/浏览器门禁的"这个月有数据"依赖写死日期与浏览器时钟 | [QW] 2026-10-03：旧写法 `nowUtc.getUTCMonth()+1` + 种子写死 `2026-09/2026-10`，10 月 31 日后必然 0 成员假红；实测锚到 8 月还会因 `profiles.created_at <= range_end` 让 10-01 建的测试组长整人消失（≥2 塌成 1） | 已关闭 | 种子每次把锚点写入 `output/gate-roles-anchor.json`（gitignored），两份 spec 只消费；算式由 `scripts/seed-roles-test-data.test.ts` 注入"上海跨月凌晨"时刻回归，已纳入 `gate:static` 的 `scripts/*.test.ts`。后续日历类用例禁止再用 `new Date()` 推月份 | P2 |
| 门禁环境可被外部地址/错构建悄悄劫持（假红与假绿双向） | [QW] 2026-10-03 两起实测：①在门禁之外跑一次不带 `.env.ai-test.local` 的 `next build`，生产地址被编进浏览器包，3100 复用后三个角色页 500、写接口 403→500，4/4 全红；②只要设了 `DYDATA_E2E_BASE_URL`，Playwright 根本不启动本地服务端，用例对着外部哨兵照样"全绿"（假绿更危险，`reuseExistingServer:false` 只堵得住默认路径） | 已收口三层 | ① 新增 `scripts/assert-local-gate-env.mjs`：设外部地址必须显式 `DYDATA_GATE_ALLOW_EXTERNAL=1`（兼容并行线的 `DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY=1`），并强制门禁指向本地库；两个 playwright config 加载时即调用，`gate:roles` 也调用；**`run-browser-gate.mjs` 第一版只 import 未调用（等于死代码，且预检排在 build 之后），03:1x 独立审查打出、已修正为"预检先于 build 调用"，并补一条源码级断言防止再退化成只 import**；②`reuseExistingServer` 默认 false（要复用显式 `DYDATA_GATE_REUSE=1`）；③`run-role-gate-server.mjs` 启动前自断非本地库。行为由 `scripts/assert-local-gate-env.test.ts` 钉住（含"三个入口必须真的调用预检"与"锚点缺失时自动补跑 seed:roles"两条，后者是独立审查打出的第二缺陷：干净检出直接跑 `gate:browser` 会因缺 gitignored 的锚点文件硬失败）。**与并行线的 acceptance 拆分（`playwright.acceptance.config.ts`、`gate:browser:local`/`gate:accept:production`）是同一诉求，落地时合并成一个 guard，别留两套互相拦截** | P1 |
| 多会话共用同一个本地库与门禁端口，读数会互相污染（同一份代码两次跑差 11 条） | [QW] 2026-10-03 06:21 在 HEAD `cbe1f3ec` 跑全量 `gate:roles` → **21 passed / 11 failed**；同一提交号、同一台机器 06:31 重跑 → **32 passed 退出码 0**。期间另一会话正在提交 `src/`（06:18、06:20）并共用 `.env.ai-test.local` 指向的本地库，种子会删表重插、门禁服务端抢 3100 | 未收口（并发协作缺陷） | 三条建议：①`gate:roles`/`gate:browser` 开跑时打印并锁存 `git rev-parse HEAD`，跑完比对不一致就判"读数无效"；②并发会话按台账上一行约定分端口与分库（门禁专用库或每会话独立 Postgres 库）；③重要读数一律跑两次、且独占时段取数 | P1 |
| 共享工作区的 `.next` 可能混入他人未提交代码，据此取得的"绿灯/红灯"都不忠实 | [QW] 2026-10-03 独立审查实测：02:27 那份构建里含有只存在于工作区、HEAD 里没有的 `markAppealTodosDone`，用它跑角色门禁会多红一类（第 5 类）；施工侧更早一次也被同类产物骗出 4/4 假红 | 未收口（多会话并发共性缺陷） | 三条落地建议：①门禁与审查证据一律在隔离 worktree 取得（`git worktree add --detach` + `cp -al node_modules`），别共用主工作区 `.next`；②`gate:*` 开头核一次 `git status --porcelain -- src/`，非空即拒绝并提示"主树有未提交应用代码"；③并发会话约定端口（3100 归门禁，其余会话用 32xx）。另注：本会话遗留两个未拆的审查 worktree（`.worktrees/push-audit-a138eb02`、`.worktrees/push-audit-clean2`），拆目录属删除操作，留给独占时段处理 | P2 |
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
| 共享主干时推送未先通报，导致未经当轮授权的改动上线 | 2026-10-03 00:43 与 00:52 两次推送把本地全部提交带上远端，含审批链四笔代码提交（`681b4cb2`、`785bbe0c`、`baaf2919`、`58dd292f`）——本工程原计划「阶段 3 封板后由阿禅当轮确认再推」；提交内容本身已经复验，但「推线上」这一动作未经确认，也没做过推后健康核对 | 已立规矩（2026-10-03 02:25 阿禅点头，`AGENTS.md` §四 部署节新增两行：推送前逐笔声明将上线哪些提交＋推送后必须补线上核对并留档） | 规矩已落；仍缺一次「按规矩走完全程」的正例——下一批推送（阶段 6 第一刀）按新规矩执行并记日志即可销项 | P1 |
| [QW] 自伤记录：脚本把字符串当元组迭代，写坏技术债台账 | 2026-10-03 01:30 我用批量改文档的脚本追加表格行时，`appends` 传成了字符串而非元组，逐字符各占一行，台账从 293 行膨胀到 556 行 | 已修复 | 已用提交版本整文件还原（`git show HEAD:docs/tech-debt-ledger.md`）再重新落两行；教训与既有纪律同条：**共享表格文件禁止用字符串拼接式脚本改，改完必须核行数与首尾各 3 行** | P2 |
| 门禁判据与脚本不一致：阻断线判据 1000、脚本实值 1200，且缺"活动度准入／路过必削／基线棘轮"三项机制 | 阿禅 2026-10-03 09:15 拍板，判据已写进 B 方案 §3.3 与 `docs/architecture-decisions/0006-拆分准入门槛与棘轮.md`；实测数据：>1000 有 12 个、>800 有 25 个（新增 13 个平均改动仅 23.6 次）、600–1000 行且改动 ≥45 次的有 4 个（导航栏 701/71 最典型）；发布管理页 10-02→10-03 从 2398 涨到 2699 行，证明"只拆不锁"会反弹 | 已收口（**[QW] 10-03 11:00 独立复验通过**，注入实验与基线核对均自跑） | `scripts/maintainability-gate.mjs` 已支持 `--base=<ref>`、1000 行阻断、活动度名单、路过必削与基线棘轮；基线清单为 `scripts/maintainability-baseline.json`，测试/类型/生成文件分栏。注入实测：1001 行新文件退出码 1、999 行退出码 0；700 行／90 天 45 次列入名单；>800 非名单文件加 1 行退出码 1、减 1 行退出码 0；基线加 1 行退出码 1；`node --test scripts/maintainability-gate.test.mjs` 7/7 退出码 0。阈值与三份 `allowRawMap` 白名单未放松。**[QW] 11:00 独立复验通过**：自建临时 git 仓注入 10/10（1001 阻断/999 放行、棘轮 +1 阻断、802 阻断 800 放行、漏基线 `missing-baseline` 阻断、基线额度上调 `baseline-file-increase` 阻断、并发取低值 695 阻断/690 放行、700 行×45 次进名单 `rule=activity`）；基线 40 条经脚本逐一核对＝每条等于当前真实行数（无放水额度）、>500 非名单文件 0 漏册、0 过期条目、名单 15 个与 B02–B17 批次表吻合；负对照 `--base=b08cc0aa` exit 1 恰抓 fulfillment-workbench/modules-content-v3/unified-command-hub 三个改过的 >1000 文件；`npm test` 1948/1948、`gate:static` 全链 exit 0、`gate:browser` 2 passed 1 skipped | P1 |
