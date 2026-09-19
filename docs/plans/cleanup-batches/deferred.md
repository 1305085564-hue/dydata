# 暂缓清单（B 类需确认 / D 类架构收口）

> 原则：本文件里的东西**不进批次 1–6**，不许"顺手删"。B 类等确认结论逐个转正或销案；D 类走批次 7 专项重构立项。
> 行号引用自扫描报告（基线 d93b0ab），执行任何一项前按 NU-8 流程重取行号。

## 一、B 类：中置信度候选（需确认后才能定性）

### 建议保留类（确认后销案即可，勿删）

| 项 | 内容 | 为什么不能删 | 需谁确认什么 |
|---|---|---|---|
| B-02 | `/auth/logout` 路由（`src/app/auth/logout/route.ts`） | 作者注释自述"NavBar 崩溃时地址栏退出"兜底，刻意保留 | 前端/账号 owner：保留并补注释即可 |
| B-04 | `/reset-password` 页 | 仅 Supabase 重置邮件 `next` 链接可达（`lib/auth-password.ts:134`），外部长链 | 无需确认，记录销案 |
| B-06 | `DashboardAnimatedSection` | 生产在用但函数体是恒等包装（opacity:1/translateY(0)，delay 永不生效）→ 是"可简化"不是"死" | 动画 owner 知会；若要简化则单独小 PR |
| B-20 | `NEXT_PUBLIC_APP_URL` vs `NEXT_PUBLIC_SITE_URL` | 语义重复但都在读；属文档缺口非死配置 | 运维：二选一写入 `.env.example` |
| B-21 | `SUPABASE_DB_URL` / `SUPABASE_ACCESS_TOKEN` | 代码不读但 psql/CLI 人工 DDL 通道靠它们 | 运维：`.env.example` 标注"仅 CLI 用" |
| B-22 | `BAIDU_OCR_API_KEY/SECRET_KEY` | `baidu-ocr.ts` 经 `getEnvValue()` 动态读取，grep 未命中属误报 | 无需确认，销案 |

### 需产品表态类（恢复计划内 → 保留；确认下线 → 转 A 类小批删除）

| 项 | 内容 | 确认问题 | 确认人 |
|---|---|---|---|
| B-01 | `/api/admin/topics-library/feishu-url`（系统配置写端点+审计） | ✅ 已拍板（2026-09-19 阿禅）：**保留**，挂待办——下次需要改地址时在管理端补一个设置输入框（见 `docs/待办清单.md` P3），转 B 类跟踪结束 | 已结 |
| B-03 | `/topics/[id]` 详情桩（redirect 兼容） | 近 90 天旧深链流量（线上日志） | 产品 + 运维 |
| B-05 | `alert-groups.ts` `groupDashboardAlerts`（仅 test 引用；test 用动态 import+存在性断言，grep 会漏） | ✅ 已拍板（2026-09-19 阿禅）：**不做分组，删**——已转入 `batch-1.md` 执行清单（源文件+存在性断言测试同删） | 已结 |
| B-07 | `admin-ai/presentation.ts` 整文件（仅自身 test） | admin-tools 是否应接此渲染层 | 后端 |
| B-08 | 测试撑活死 lib 六件：`ai/insight-period.ts`、`case-library/confidence.ts`、`in-flight-request.ts`、`工作日.ts`、`飞书提醒.ts`、`performance-gate.ts` | ✅ 2026-09-19 事实核查+阿禅口径：**删五保一**——现役飞书发送已统一在 `飞书webhook.ts`（dashboard actions/first-screen-monitor 在用，删 `飞书提醒.ts` 旧升级提醒不影响发送）；`工作日.ts` 零 importer；insight-period/in-flight/case-confidence 零消费者；**`performance-gate.ts` 保留**：`tests/performance/首屏门禁.spec.ts` 是 `playwright.config.ts testDir` 的全部内容、`gate:browser` 门禁本体，删=浏览器门禁空转（⚠️ 勿混：`飞书webhook.ts` 活；`feishu/client.ts` 被 `api/feishu/event` 动态 import，活）。待 BLK-1 解除后转删除小批 | **已获阿禅确认（2026-09-19）：推荐成立，performance-gate 保留为定案** |
| B-09 | 活文件内 test-only 导出 12 组（video-tags、metrics:332、dashboard-submission-state:129、趋势图:167、豁免.ts:286/402、sample-quality、content-attribution、content-segmentation、豁免流程、填报表单状态、提交状态机、topic-navigation） | 无产品问题，纯前端收 `export`（去导出+改测试为行为断言），可自成一低风险小批 | 前端 |
| B-10 | `animations.ts` docs-only hooks（useCountUp:211/useTypewriter:280）+ test-only variants | 设计系统是否承诺这些 API | 设计 owner |
| B-13 | `TopicPoolExplorer.tsx:602` 恒隐藏占位 span | ✅ 已拍板（2026-09-19 阿禅）：**不显示，删**——已转入 `batch-1.md` 执行清单（只删 L602-605，文件是活组件） | 已结 |
| B-14 | `member-permission-editor.tsx:17` 五个声明即零消费 props | ✅ 已拍板（2026-09-19 阿禅）：**权限编辑后期要做成可灵活选择**→ 不删、维持现状，已挂 `docs/待办清单.md` 排期项；重做接线时这五个 props 按新设计重写 | 已结 |
| B-15 | `content-comparison-reference.ts:255` `getLegacyComparisonData` | 是否动态调用的回退路径 | dev |

### 结构性确认类（流程重，单独立项）

| 项 | 内容 | 处置 |
|---|---|---|
| B-11 | `admin/权限管理.ts:188/:194` 两个死 patch 工厂（典型"单测覆盖了一个没人调的真相源"） | **二选一**：接回 `updateMemberTeam`/归档路径恢复单一真相源，或删函数+删 test。后端+权限 owner 定 |
| B-16 | DB orphan RPC 候选 13 个 | 只能线上 `pg_proc/pg_policy/pg_depend`+调用日志核（见 NU-5 命令），repo 不可判 |
| B-17 | 一次性运维/修数脚本 12+9 个（含 `scripts/_archived/` 整目录） | **不自动清理**。逐个找归属人标"保留/废弃"，废弃的也只移 `_archived` 不删。⚠️ 危险脚本（会写库/DDL/改密）清单见扫描报告 §7 表，其中 `apply-single-migration.mjs`（任意 DDL）最高危 |
| B-18 | `scripts/audit-daily-report-video-links.test.mjs`（不在 npm test glob 内的事实孤儿测试） | owner 决定是否纳入某 gate |
| B-19 | `PLAYWRIGHT_NO_COPY_PROMPT` | 走 NU-7 |

## 二、D 类：架构收口（批次 7 · 专项重构排期，禁与死码删除混做）

> 共同前置：任何涉及 RLS/写路径的收口，先过 BLK-1 线上核验；每域独立立项、独立验收。风险等级"高"是默认值。

| 域 | 项 | 一句话问题 | 收口方向（报告建议） |
|---|---|---|---|
| 权限/scope（最高危，越权面） | D-PERM-1 | 角色→权限模板三处封装链 | 收敛为单入口 |
| | D-PERM-2 | 两套路由门禁 + `restrictPersonRows` 用原始角色串第三判 | 统一到 `canAccessRoute` + 固定权限模型 |
| | D-PERM-3 | API 鉴权 helper 8+ 套各写一遍 | 统一 `requireActor` 门面 |
| | D-PERM-4 | 局部 scope 实现游离于权限索引外（4 处 + operator-members 自定义过滤） | 纳入统一索引；写 RLS 谓词判同公司用 `team_id` 非 `role`（memory 教训） |
| | D-PERM-5 | `data-access-scope.ts:62` `void configuredScope` —— 读 `data_scope` 列后恒忽略 | 判 C 仅记录；与"三角色简化"目标模型（权限与视角分离）合并设计 |
| 豁免（最重灾区） | D-EXE-1~5 | 中英双命名族、双弹窗、双写入入口、重名 action、legacy/V2 双 grant mode | D-EXE-5 系有意保留勿当陈旧；其余随 A-11/A-15 清完后统一命名与入口 |
| Rewrite | D-RW-1/2 | 同一 UI 混用两套 API 前缀、三套目录命名 | 统一 DTO/鉴权/前缀专项 |
| Topics | D-TPC-1~4 | 员工端/管理端接口边界未画、旧键并存、双实现、目录 v2 实为 v3 | 正名 + 契约合一（A-13 已完成部分） |
| 视频/内容 | D-VID-1/2 | 两套 list/详情服务两个页面、跨模块反向 fetch | 非死，整合查询/DTO |
| 成员 | D-MEM-1 | 经核为合理分层 | **无需收口**，仅命名相近，销案 |
| 数据/工具 | D-DB-1~5 | 状态机双实现、类型双定义、buildSnapshotMap 双份、格式化四处重造、错误信封 3 种 | 各抽公共层；D-DB-2 死面已随 A-09 清一半 |
| 通知 | D-NOT-1 | 飞书出口 5+ 处各一套 | 统一 `飞书webhook.ts` + 归属表 |
| 公共 UI | D-UI-1~6 | 浮层三套（不清）、骨架三件套（不删）、ErrorState vs RouteErrorState（RouteErrorState 属 C 勿删）、中英双导出别名（批量改名需阿禅拍板）、AppShell 预留 API 面（与 owner 议）、ui passthrough 子导出（收益低） | 多为规范治理非清理 |

## 三、明确"永不动"红线（从 BLK 提炼，贴在执行入口）

1. `supabase/migrations/` 整目录冻结（BLK-2：链不可重放 + `补丁/` 游离 + 与线上漂移）；`get_daily_quota` 属"缺失"须补进链而非删（BLK-3）。
2. 外部触发入口永不判死：`/api/feishu/event`、`/api/supabase-keepalive`、`/api/notifications/cleanup`、`/api/health`（BLK-6）。
3. RLS/trigger/内部函数（`visible_user_ids`、`is_admin_or_owner`、`company_role_for_user`、`get_data_scope`、`has_permission` 等）不因"代码没点名"判死（BLK-1 + 报告 §7）。
4. 危险脚本（§7 表 12 个）执行前必须 owner 签字，且默认只做"归档标记"不做删除。
5. v1/v2 双版函数、`company_role`/`role` 双列、`exempt_*` 投影列：判 C，线上核验（NU-5）前任何"删旧版"动作禁止。
