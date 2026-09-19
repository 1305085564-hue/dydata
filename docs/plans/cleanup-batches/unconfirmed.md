# 未确认事项核查清单（NU-1 ~ NU-8）

> 状态标记按 2026-09-19 磁盘复核更新。**"已关闭"仅表示本清单已给出证据与处置，签字/线上核验流程照走，不等于自动执行。**

## NU-1 · 豁免快捷集群是否真挂在生产渲染树 —— 已关闭（2026-09-19 阿禅拍板：删）

- 关联: A-11（批次 4）。冲突: A 组 Agent 判闭合死子图，F 组 Agent 判"旧弹窗仍在用"。
- 复核证据: 全仓（含测试）对 `DashboardWorkspaceHeader`/`QuickExemptionButton`/`ExemptionModal` 的引用只剩 readFileSync 测试与一条注释（`video-submit-panel-v2.tsx:1028`）；无任何静态或 `dynamic()` import。静态意义上子图闭合。
- 核查方法: ① `rg -n "quick-exemption-button|dashboard-workspace-header|申请豁免弹窗" src -g '!src/app/(app)/dashboard/components/*' -g '!src/app/(app)/dashboard/申请豁免弹窗.tsx'` 复跑为空；② 前端 owner 本地跑 `npm run dev`，从 dashboard 顶栏与卡片位逐一确认无"快捷豁免"入口渲染（动态字符串组件名是唯一 grep 盲区）；③ 对比 `exemption-dialog-v2.tsx` 的 `variant="card"` 能力覆盖。
- 确认人: 产品 + 前端 owner（双签）→ **产品已于 2026-09-19 拍板"删"**。
- 结论处置: ✅ 按"死"处理，A-11 进入执行（批次 4 前置已满足其一）；前端 owner 运行时核查降为知会项，事后若发现隐藏入口即 `git revert` 回滚该 commit。

## NU-2 · admin 版 submitExemptionRequest 是否重复定义 —— 基本关闭，留签字

- 关联: A-15h（批次 2）。
- 复核证据: 所有 importer（`video-submit-panel-v2.tsx:34`、`申请豁免弹窗.tsx:17`）的 `"./actions"` 均解析到 dashboard 版（`dashboard/actions.ts:372`）；`admin/actions.ts:392` 版零 importer。→ 定性：重复定义，可删。
- 核查方法（终验）: `rg -n "submitExemptionRequest" src -g '!src/app/(app)/admin/actions.ts'` 人工过一遍每条命中所在目录；服务端 action 反编译调用无法从 repo 排除 → 运维确认无外部按编译 action id POST。
- 确认人: **后端 owner**（写路径收口）+ 运维（外部调用）。
- 结论处置: 签字通过 → 批次 2 删 A-15h；若称有独立路径 → 要求指出 importer，指不出则维持可删结论。

## NU-3 · topics-v2 三组件是死是"未接线新功能" —— 已关闭（修正为：活，不删）

- 关联: A-14、A-13 连带。
- 关闭证据: `TopicHubV2.tsx:32`（直接 import TopicPoolExplorer）、`:38-46`（两个 drawer 走 `dynamic(() => import(...))`）、`:623/:680/:734`（渲染点）；`src/app/(app)/topics/page.tsx:80` 渲染 TopicHubV2。报告"零生产引用"系 grep 漏动态 import。
- 核查方法: 无需再查；如需双保险，`rg -n "TopicPoolExplorer|TopicWorkBreakdownDrawer|TopicMoreFiltersDrawer" src/components/topics-v2/TopicHubV2.tsx`。
- 确认人: 无（事实性关闭）。
- 结论处置: A-14 移出删除清单；A-13 的 `DETAIL_PAGE_SIZE` 迁移必须做（生产消费方存在）。

## NU-4 · /api/export 与 feishu-url 是否为运维/合规手动通道 —— 已关闭（2026-09-19 阿禅拍板：两项均保留转待办）

- 关联: A-24（批次 3）、B-01（deferred）。
- 核查方法: ① Vercel 访问日志拉近 90 天 `GET /api/export`、`POST /api/admin/topics-library/feishu-url` 命中（repo 无此数据，必须线上）；② 问运维是否有 curl/脚本手动调用习惯；③ 问产品"选题库飞书工作空间地址现在在哪改"（若无 UI，B-01 端点是唯一通道，不删）。
- 确认人: **运维 + 产品 + 后端**。
- 结论处置: ✅ export 部分已由阿禅 2026-09-19 拍板"保留、计入待办以后要加"——A-24/A-25 撤案，正式重做时须补权限+审计（见 `docs/待办清单.md` P3）；✅ feishu-url 同日拍板"保留，管理端补设置入口"（B-01 转待办）。线上流量核查（方法①②）不再作为删除前置，仅留作导出通道重做时的背景参考。本项无遗留。

## NU-5 · DB orphan RPC / v1v2 函数 / 双列 / exempt_* 投影列 —— 未关闭（repo 不可判）

- 关联: B-16、D-PERM-5、A-12 前置（deferred 批次 7）。
- 核查方法: 连生产库（经 authorized 通道，非 service-role 裸连）逐条实测：
  - `SELECT proname, pd.roleid FROM pg_proc p LEFT JOIN pg_depend d ON d.objid=p.oid AND d.deptype='i' WHERE proname IN ('conversion_hub_advice_list','conversion_hub_pipeline_counts','conversion_hub_weekly_items','publish_drafts_approved_list','publish_drafts_review_queue','admin_pending_videos_today','admin_pending_violations','admin_analytics_first_screen','admin_sidebar_badges_summary','admin_anomaly_videos_today','case_library_processed','validate_invite_code','get_today_submission_status','get_daily_quota') AND d.objid IS NULL;`（无内部依赖的候选）
  - `SELECT * FROM pg_policy WHERE polrelid='<表>'::regclass;` 看 policy 表达式是否引用上述函数/`data_scope` 列/`company_role` 列；`SELECT DISTINCT jsonb_array_elements_text(request::jsonb#>'{}') FROM ...` 类 PostgREST 调用日志/`pg_stat_user_functions` 佐证热度。
  - `get_daily_quota` 无论结果如何先按 **BLK-3** 补进迁移链（这是缺失不是死码）。
- 确认人: **backend + DBA + 权限 owner**。
- 结论处置: 任一对象被 RLS/trigger/老客户端引用 → 永不能凭 repo 判死（BLK-1 常态生效）。

## NU-6 · /violations 历史页面迁往何处 —— 已关闭

- 关联: A-27。
- 关闭证据: `rg -n "violations" src/middleware.ts` 已为空（matcher 与保护分支随提交 `45d6e704` 删除）；`review_violations` 权限键保留不受影响。页面迁移去向无需再查——删除动作本身已完成，回归测试随那批提交跑过。
- 核查方法: 双保险 `git log --oneline -- src/middleware.ts | head` 查 45d6e704 diff。
- 确认人: 无。
- 结论处置: A-27 移入"已完成"，批次 5 不再列。

## NU-7 · PLAYWRIGHT_NO_COPY_PROMPT 是否 Playwright 内部约定 —— 未关闭（低危）

- 关联: B-19（deferred）。
- 核查方法: ① `rg -n "PLAYWRIGHT_NO_COPY_PROMPT" .` 确认仅 `playwright.config.ts:4` 设值；② 查 Playwright 当前版本文档/源码是否存在该环境变量约定（WebSearch/官方 repo）；③ 问 e2e owner 设值时的动机（疑为复制防护实验）。
- 确认人: **e2e owner**。
- 结论处置: 非约定 → 作为"死配置"并入批次 5 尾单删除（1 行）；是约定 → 在 config 行尾补注释说明来源。

## NU-8 · 本地 main 与 origin 分叉，审的是哪份代码 —— 常态规则，非一次性事项

- 关联: 全部批次。
- 事实: 报告基线 `d93b0ab`；本清单基线 `c0beeeed`（其间 5 个提交已改动 src 行号）；origin 与本地分叉关系未消失。
- 核查方法（每批执行前）: ① `git fetch && git rev-list --left-right --count origin/main...HEAD` 记录当前分叉数；② 以**执行时磁盘**为准重跑各条 `rg -n` 拿最新行号，勿照抄本清单行号硬删；③ 若清理要进候选发布分支（`codex/maintenance-release-*` 等），用 `git show <branch>:<file>` 读分支 blob 复核，不信本地工作树代表 origin。
- 确认人: 执行人自己（流程项）。
- 结论处置: 写进每批"执行步骤 2"；commit 只在本地，push main 遵循统一授权口径（AGENTS.md:125）。
