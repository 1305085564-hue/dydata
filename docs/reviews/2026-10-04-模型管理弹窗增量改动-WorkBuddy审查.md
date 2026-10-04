\# 阶段 6 窗口 B 续派令：B03 内容列表 ＋ B14 履约工作台 ＋ B12 内容详情弹窗 ＋ B15 成员卡片 ＋ B06 协作工作台 ＋ B17 协作接口共享层（打包派发、逐批停验）  
  
\> 签发：\\[QW]（接任）2026-10-03 23:1x，B05 复验合入后。\*\*2026-10-04 02:3x 增补 B17 一节\*\*（阿禅拍板把队列尾部三批并入本轮：B15/B06 归窗口 A，B17 归本包压轴）。\*\*2026-10-04 10:3x 阿禅改拍"两轮·零撞车"：B15/B06 从窗口 A 移交本包——B12/B15/B06 共享\** \*\*\`collaboration-workbench-structure.test.ts\`，同窗串行才不打架。\**  
\> 用法：整段粘进窗口 B 的 Codex。  
\> \*\*队列顺序：B13 → B03 → B14 → B12 → B15 → B06 → B17。\** B13（\`dd8efd22\`）、B03（\`8b6c9e14\`＋返工 \`6dde229c\`＋收口 \`f378b300\`，棘轮 1529→77）均已复验合入。\*\*当前从第二批 B14 开工\*\*，worktree \`.worktrees/stage6-b14\`，开工前对齐最新 main（≥ \`490b34b6\`）。  
\> \*\*逐批停验\*\*：每批做完即停→阿禅转 \\[QW] 复验→通过后同窗口续做下一批。  
\> \*\*新规：阶段 6 期间只 commit 不 push，push 由 \\[QW] 攒批统一执行。\**  
\> 前提：B05 已合入 main（TopicHubV2 已拆，\`hub/\`、\`topics/{domain,data}\` 就位）。每批开工前对齐最新 main。  
  
\***  
  
\## 【执行纪律（通用，先读三遍）】  
  
\- 不理解需求、不优化、不加创意；\*\*纯搬移重构\*\*，行为零变化。  
\- 拆法以 \`docs/plans/2026-10-02-全站结构拆分作战图.md\` §2 对应行为准。  
\- 只能：补类型、调命名、写注释。改逻辑＝违规。施工者不得自签。  
\- 每条验收命令附\*\*原文与退出码\*\*；报告三分层：完整实现／留尾巴／发现未动。  
\- 分层尺：编排≤200／视图≤400／状态≤300／取数≤400／规则≤300／类型≤150，单文件≤500；禁 \`new globalThis.Map\`；禁压行；注释零丢失。  
\- 锚点自检用\*\*按文件名跨行检索\*\*（\`rg -n "<文件名>" src scripts --glob '\*.test.ts' --glob '\*.spec.ts' --glob '\*.mjs'\`），禁止带 \`[^)]\*\` 的正则（\`resolve(process.cwd(),…)\` 嵌套括号与字符串数组写法会被挡，实测漏检）。  
\- \*\*多文件拼接锚点铁律\*\*：断言改成"拼接多个新文件再匹配"时，凡用 \`[\s\S]\*?\` 跨行的断言，必须确认\*\*匹配两端落在同一文件内\*\*（否则跨文件边界"缝合"出假通过）；做不到就拆成按文件分别断言。B12/B17 适用。  
  
\***  
  
\## 第一批 B03：\`src/app/(app)/admin/content/content-list.tsx\`（1529 行）  
  
【目标】按作战图 §2 \`content-list\` 行拆：  
  
1\. 领域层 → \`src/lib/content/domain/\`：筛选、生命周期、评级/状态规则。  
2\. 数据层 → \`src/lib/content/data/\`：列表 loader、筛选查询、分页。  
3\. 呈现层 → 列表行、筛选栏、空态拆到 \`src/app/(app)/admin/content/\` 下组件；原文件只留编排壳。  
4\. 兼容出口：保留 \`ContentList\` 导出；\`content-page-client.tsx\` 的 import 不改。  
5\. 注意：\`content-list-filters.ts(x)\` 已是独立文件（其测试走值导入），搬它内部逻辑时保持出口不变。  
  
【锚点（实测 4 处，只改指向、断言一字不改）】  
  
1\. \`src/lib/content-feedback-removal.test.ts:26\`  
2\. \`src/lib/a11y-responsive-integration.test.ts:13\`  
3\. \`src/app/(app)/admin/content/content-list-unified-columns.test.ts:9\` — 相对 URL \`./content-list.tsx\`，\*\*原文件必须留在原位\*\*；断言"只调用契约短文案函数、无本地分支与硬编码待采集兜底"随代码去向改指或保持  
4\. 同文件 \`:60\` 的测试名指向 content-list，内容断言不动  
  
【禁区】\`src/app/(app)/admin/collaboration/\*\*\`、\`fulfillment/\*\*\`（第三批）、\`modules/\*\*\`（窗口 A 域）、\`unified-command-hub.tsx\`、\`dashboard/\*\*\`、\`ai-config/\*\*\`（并行 WIP）、\`scripts/maintainability-baseline.json\`。  
  
【环境准备】  
  
\`\`\`sh  
cd /Users/mac/Projects/dydata  
git worktree add .worktrees/stage6-b03 -b codex/stage6-b03 main  
cp -Rc node_modules .worktrees/stage6-b03/node_modules  
ln -s /Users/mac/Projects/dydata/.env.local .worktrees/stage6-b03/.env.local  
ln -s /Users/mac/Projects/dydata/.env.ai-test.local .worktrees/stage6-b03/.env.ai-test.local  
\`\`\`  
  
3100 被窗口 A 占用时按约定换端口跑浏览器门禁；跑前与阿禅确认，重要读数跑两次。  
  
【验收命令（worktree 内，附原文与退出码）】  
  
\`\`\`sh  
npx tsc --noEmit --pretty false  
npm test  
npm run gate:static  
npm run gate:browser        # 附 /admin/content 列表页前后截图  
node scripts/maintainability-gate.mjs --base origin/main  
git diff --check  
\`\`\`  
  
注释自检：\`git show main:"src/app/(app)/admin/content/content-list.tsx" | grep -cE "^\s\*(//|/\\\*|\\\*|\\{/\\\*)"\` 与新文件合计核对。  
  
【交付】精确点名 \`git add\`；只 commit 不 push；做完立即停，报告附：新行数、各新文件行数、锚点去向表、搬走单元清单。  
  
\***  
  
\## 第二批 B14：\`src/app/(app)/admin/fulfillment/fulfillment-workbench.tsx\`（1064 行）  
  
\> 仅在 B03 复验通过后开工，worktree \`.worktrees/stage6-b14\`。  
  
【目标】按作战图 §2 行拆：  
  
1\. 领域层 → \`src/lib/fulfillment/domain/\`：履约设置、申诉/待办状态规则。  
2\. 数据层 → \`src/lib/fulfillment/data/\`：appeals/settings loader 与 action 客户端。  
3\. 呈现层 → 设置、申诉列表、反馈组件拆出；原文件只留工作台布局壳。  
4\. \*\*红线\*\*：\`src/app/api/admin/fulfillment/appeal/\*\*\` 与审批处理链\*\*不在本批施工\*\*，一行不碰；申诉/审批的业务判断（含刚上线的统一审批池逻辑）只搬不改。  
  
【锚点（实测 5 处）】  
  
1\. \`src/app/(app)/dashboard/production-control-system.test.ts:30\`  
2\. \`src/app/(app)/admin/fulfillment/fulfillment-workbench.test.ts:11\` — \*\*值导入\*\*，兼容出口必须保住被导入符号  
3\. 同文件 \`:29\` — readSource  
4\. \`fulfillment-appeals.test.ts:4\` — \`import { fetchFulfillmentAppeals } from "./fulfillment-workbench"\` ⇒ 该符号必须仍可从原文件导入（re-export 或留守）  
5\. \`fulfillment-settings.test.ts:4\` — \`fetchFulfillmentSettings\`、\`loadFulfillmentSettings\` 同上  
  
【验收】同 B03 命令组＋\`gate:browser\` 附 \`/admin/fulfillment\` 前后截图。交付即停。  
  
\***  
  
\## 第三批 B12：\`src/app/(app)/admin/content/content-detail-dialog.tsx\`（1395 行）  
  
\> 仅在 B14 复验通过后开工，worktree \`.worktrees/stage6-b12\`。  
  
【目标】按作战图 §2 行拆：  
  
1\. 领域层 → \`src/lib/content/domain/detail.ts\`：详情状态、评级与权限分支（目录 B03 已建，复用）。  
2\. 数据层 → \`src/lib/content/data/detail.ts\`：详情/指标读取。  
3\. 呈现层 → 原文件只留 dialog 壳；指标、诊断、历史区块拆出。  
4\. 兼容出口：保留 \`ContentDetailDialog\`；\`content-diagnosis-loading.test.ts:12\` 断言 \`dynamic(() => import("./content-detail-dialog"))\` ⇒ \*\*原文件路径与默认导出必须保留\*\*。  
  
【锚点（实测 9 处命中，开工前跨行检索复核全量）】  
  
1\. \`src/lib/content-feedback-removal.test.ts:27\`  
2\. \`src/lib/a11y-responsive-integration.test.ts:75\` 与 \`:161\`（10-04 实测行号，原记 :57/:143 系 ai-config 批追加测试后漂移）  
3\. \`content-diagnosis-loading.test.ts:12\`（dynamic 路径）与 \`:22\`（readSource）  
4\. \`src/components/windows-adaptation-second-batch.test.ts:46-48\`（diagnosisPreview 块，路径串在 \`:47\`）  
5\. \`src/app/(app)/admin/content/content-diagnosis-workbench-structure.test.ts:7\`  
6\. \`src/app/(app)/admin/collaboration/collaboration-workbench-structure.test.ts:13\`（相对 URL 读 content-detail-dialog）⚠️ \*\*该测试文件后续被本包 B15（\`:85\`\** \*\*personal-card 块）、B06（\`:7\`\** \*\*workbench 块）改动\*\*——三批同窗串行，你\*\*只改\** \*\*\`:13\`\** \*\*的\** \*\*\`dialogSource\`\** \*\*读取\*\*（拼接或改指 content-detail-dialog 去向），\`:7\`/\`:85\` 及其余块一律不动（那是 B15/B06 的活，你做完它们才开工）。  
7\. \`src/components/ui/dialog-layout.test.ts:43\`  
  
【禁区】\`personal-card.tsx\` 与 \`collaboration-workbench.tsx\`（本包 B15/B06 的名单，在你之后开工，本批只搬 dialog 本体）；权限可见范围口径以 \`docs/权限与安全说明.md\` 为准，\*\*不得放宽\*\*。  
  
【验收】同前＋\`gate:browser\` 附内容详情弹窗打开态前后截图。交付即停。  
  
\***  
  
\## 第四批 B15：\`src/app/(app)/admin/collaboration/personal-card.tsx\`（1103 行）  
  
\> \*\*仅在 B12 复验通过后开工\*\*，worktree 用 \`.worktrees/stage6-b15\`。（10-04 从窗口 A 移交本包）  
  
【目标】按作战图 §2 \`personal-card\` 行拆：  
  
1\. 领域层 → \`src/lib/collaboration/domain/person-metrics.ts\`：图表点位、指标格式化与评级判断（\`resolveChartPoint\`、tooltip 计算等纯函数）。  
2\. 数据层 → \`src/lib/collaboration/data/person.ts\`：成员档案与趋势读取（目录若未建则本批建，B06/B17 紧随其后共用）。  
3\. 呈现层 → 卡片区块（绩效／趋势／档案／操作）各成组件；原文件只留编排壳。  
4\. 兼容出口：保留 \`PersonalCard\` \*\*值导出\*\*——调用方 \`collaboration-workbench.tsx\` 的 import 不改。  
5\. 权限口径以 \`docs/权限与安全说明.md\` 为准，\*\*本批不得放宽可见范围\*\*。  
  
【锚点（实测 2 处，只改指向或拼接，断言一字不改）】  
  
1\. \`collaboration-workbench-structure.test.ts:85\` — \`readFileSync(new URL("./personal-card.tsx", import.meta.url))\`，其下 7 条断言（\`max-w-4xl sm:max-w-4xl\` 三元、\`transition-all duration-300\`、\`<ContentDetailDialog...renderMode="inline"\`、\`titlePrefix="个人档案"\`、\`onBack={onCloseDiagnosis}\`、\`invisible pointer-events-none\`、\`doesNotMatch hidden\`）。\*\*这些断言涉及的 JSX 区块若搬出，该测试改为拼接原壳＋新组件文件\*\*（照 B10 的 form-v2 多文件拼接法＋拼接铁律：跨行断言两端同文件），断言本体一字不动。⚠️ \*\*\`:7\`（workbench 块）与\** \*\*\`:13\`（dialogSource，B12 已改指）不动\*\*——\`:7\` 是下一批 B06 的活。  
2\. \`person-data.test.ts:106-109\` — 绝对路径 readFileSync，断言"旧 6 个月柱状图已彻底移除、升级为近 30 天折线"；相关代码留在原位则保持指向，搬走则改指。  
  
【禁区】\`collaboration-workbench.tsx\` 本体（第五批才动）、\`content-detail-dialog.tsx\`（B12 已完成，不再动）、\`src/app/api/\*\*\`（B17 域）、\`modules/\*\*\`、\`ai-config/\*\*\`。  
【验收】同 B03 命令组＋\`gate:browser\` 附 \`/admin/collaboration\` 个人档案卡打开态前后截图。交付即停。  
  
\***  
  
\## 第五批 B06：\`src/app/(app)/admin/collaboration/collaboration-workbench.tsx\`（780 行）  
  
\> \*\*仅在 B15 复验通过后开工\*\*，worktree 用 \`.worktrees/stage6-b06\`。（10-04 从窗口 A 移交本包）  
  
【目标】按作战图 §2 \`collaboration-workbench\` 行拆：  
  
1\. 领域层 → \`src/lib/collaboration/domain/workbench-state.ts\`：月份选项、默认区间、预取时机等纯函数（\`generateMonthOptions\` 之类）。  
2\. 数据层 → \`src/lib/collaboration/data/\`（B15 已建目录，复用）：本文件用到的读取。  
3\. 呈现层 → 页签、成员列表、卡片容器各成组件；原文件只留编排壳。  
4\. 兼容出口：保留 \`CollaborationWorkbench\` \*\*值导出\*\*——调用方 \`collaboration-data-container.tsx\` 的 import 不改。  
  
【锚点（实测 2 处，⚠️ 本批最大雷区，先读三遍）】  
  
1\. \`collaboration-workbench-structure.test.ts:7\` — readFileSync \`./collaboration-workbench.tsx\`。\*\*其中\** \*\*\`:26\`\** \*\*用正则从 source 里抽取\** \*\*\`const handleTabChange = (nextTab: TabKey) => {\`\** \*\*起的完整函数体再做断言\*\*——\`handleTabChange\` \*\*必须原样留在本文件\*\*（它绑 router/URL 状态，本就不属于可搬单元）；若你把它搬走，该测试必红，禁止改测试来迁就。其余断言（\`isCurrentMonth\`、\`canOperateLifecycle={canManageVideos}\`、\`diagnosisDetail && !selectedPersonId\` 等）涉及的 JSX 若搬出，同 B15 用多文件拼接法＋拼接铁律。  
2\. \`work-group-workbench.test.ts:9\` — readFileSync \`./collaboration-workbench.tsx\`，断言内容不动。  
3\. 同 structure 测试 \`:11\` 读 \`./page.tsx\`、\`:13\` 读 content-detail-dialog（B12 已改指）、\`:85\` 读 personal-card（B15 已改指）——\*\*本批都不碰这些块\*\*，只动 \`:7\` 块。  
  
【禁区】\`personal-card.tsx\`（第四批已完成）、\`src/app/api/admin/collaboration/\*\*\`（B17 域，下一批）、\`modules/\*\*\`、\`ai-config/\*\*\`。  
【验收】同前＋\`gate:browser\` 附 \`/admin/collaboration\` 整页前后截图。交付即停。  
  
\***  
  
\## 第六批 B17：\`src/app/api/admin/collaboration/\_shared.ts\`（1636 行，权限面最广·压轴）  
  
\> \*\*开工前提（双重）：① B06 复验通过（本包上一批）；② 窗口 A 的 B07 已复验合入\*\*（B07 动 \`windows-adaptation-second-batch.test.ts\`，与本包 B12 曾同文件不同块；B17 本身不碰该文件，但 \\[QW] 要求全站热区落定后再动权限层，放行时阿禅会明说）。worktree 用 \`.worktrees/stage6-b17\`，基于含 B06 的 main。  
  
【目标】按作战图 §2 \`\_shared.ts\` 行拆：  
  
1\. 领域层 → \`src/lib/collaboration/domain/\`：身份、公司范围、归档规则等纯判断（目录 B15/B06 已建，\*\*复用不重建\*\*；新建文件名避开 \`person-metrics.ts\`/\`workbench-state.ts\`，建议 \`scope-rules.ts\` 之类）。  
2\. 数据层 → \`src/lib/collaboration/data/\`：共享查询、scope loader、响应构造（同样复用目录，文件名建议 \`queries.ts\`/\`responses.ts\`）。  
3\. \*\*\`\_shared.ts\`\** \*\*本体保留为兼容 re-export 出口，53 个导出符号一个不少\*\*——消费面实测：\`handlers.ts\`（值导入）、\`src/lib/loaders/collaboration-month-cache.ts\`、前端 \`types.ts\`/\`collaboration-data-container.tsx\`（类型导入）、5 个测试文件值导入。\*\*所有消费方的 import 路径一律不改\*\*，这是本批的命根子。  
4\. ⚠️ \*\*信息订正\*\*：作战图写"topics/group-mode 引用一起改"是\*\*过时信息\*\*——实测 \`src/app/api/topics/\_shared.ts\` 和 \`src/app/api/group-mode/\_shared.ts\` 是\*\*各自独立的文件\*\*，与本批目标无关，一行不碰。  
5\. \*\*权限复核（本批存在的意义）\*\*：按 \`docs/权限与安全说明.md\` 逐对象核对可见范围链路——\`queryScopedReports\`（:747）、\`loadCollaborationMonthDataset\`（:1064，内部消费 \`resolveCollaborationScope\` 解析结果）、\`loadPersonData\`（:1483）与 \`visibleUserIds\`/scope 过滤（:1353-1394）的边界：公司/集团模式、active/archived、对象归属。\*\*只搬不改\*\*的前提下，若发现口径疑点，停手写进报告交 \\[QW]，禁止顺手修。  
  
【锚点（实测，开工前跨行检索复核全量）】  
  
1\. \`src/app/api/admin/collaboration/\_shared.test.ts:23\` — 值导入 13 函数＋5 类型共 18 个符号，re-export 必须全保住。  
2\. \`src/app/api/admin/collaboration/content-quality.test.ts:25\`、\`work-group-views.test.ts:17\` — 同上。  
3\. \`src/app/(app)/admin/collaboration/work-group-detail-view.test.tsx:12\`、\`work-group-list-tab.test.tsx:6\` — 类型导入，路径不改即绿。  
4\. 无 readFileSync 源码断言指向本文件（实测检索为空）——搬移自由度比前几批高，但兼容出口纪律更重。  
  
【禁区】\`src/app/api/topics/\*\*\`、\`src/app/api/group-mode/\*\*\`（各自的 \\\_shared 是独立文件）、\`src/app/(app)/admin/collaboration/\*.tsx\` 前端文件（B15/B06 域）、\`modules/\*\*\`、\`ai-config/\*\*\`。  
【验收】同前命令组＋\`gate:browser\` 附 \`/admin/collaboration\` 整页＋任一协作接口页面前后截图。\*\*本批交付报告必须多附一节：权限逐对象复核结论表（对象×口径×是否改动=全部"未改"）\*\*。交付即停，这是阶段 6 最后一批。  
  
\***  
  
\## 队列尾部说明（10-04 10:3x 按"两轮·零撞车"订正）  
  
\- B16 \*\*已核销\*\*：目标 \`bindings-client.tsx\` 已被并行 ai-config 会话拆分（1346→现全目录最大 491），无需再派，见作战图核销行。  
\- B15/B06 已从窗口 A \*\*移交本包\*\*（与 B12 共享 \`collaboration-workbench-structure.test.ts\`，同窗串行才不打架），顺序 B12→B15→B06。  
\- 窗口 A 本包只剩 B07（第一轮与 B14 并行）；B17 开工前提＝B06 合入＋B07 合入，由 \\[QW] 放行。  
\- 本包 B17 完成即阶段 6 全部批次收官，\\[QW] 做总收口（基线终核＋作战图封板＋攒批 push）。  
  
