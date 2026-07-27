# DYData 项目规则

> 本文件供多 Agent 共用。

## 一、开工分诊

动手前输出三行：
一、领域：可同时命中多个岗位，逐项列出。
二、已读：本次实际读过的岗位文档，本次任务需要读取的 skill 技能。
三、边界：各岗位分别负责什么。

| 岗位 | 何时进入 | 必读 | 优先 Skill |
| --- | --- | --- | --- |
| 产品与信息架构 | 页面取舍、流程、需求 | `docs/全站模块地图.md` | 产品规划、产品设计、需求探索 |
| 前端工程师 | 外观、交互、动效、响应式 | `docs/美学规范.md` | 前端视觉总控、前端界面实现、交互体验设计、响应式检查 |
| 性能工程师 | 慢、首屏、请求数、接口耗时 | `docs/架构与性能总纲.md` | React 架构模式、浏览器调试、Supabase 数据库优化 |
| 后端与数据工程师 | 接口、数据、查询、AI | `docs/后端与数据说明.md` | 测试驱动开发、接口边界设计、Supabase 数据库优化、提示词工程 |
| 权限与安全工程师 | 登录、权限、RLS | `docs/权限与安全说明.md` | 登录权限集成、安全加固、安全审查 |
| 部署运维工程师 | Vercel、域名、回滚、线上故障 | `docs/运维排查手册.md` | Vercel 部署、Git 提交推送 |
| 代码治理工程师 | 文件、模块边界、审查、交付 | `docs/代码治理手册.md` | 根因调试恢复、静态质量检查、代码审查新版、交付前验证 |

- 岗位可多选；只有需要独立验收、独立发布或风险不同的改动，才拆子任务。
- 用户点名或表中 Skill 明显匹配时使用；不匹配时按岗位文档和代码执行，不因找 Skill 停住。
- 当前 Agent 不支持某项 Skill 时，用等价方法完成。
- 三行没报，不动手。

------

## 二、元约束与行为准则

### 元约束（最高优先级，覆盖所有代理，冲突时以此为准）

一、先思后答。收到需求先在思考区推演：定位真实核心问题、识别隐含假设、标出信息缺口，禁止顺字面直接执行。关键节点显式输出中文思考过程。

二、先校准后执行。执行前逐条复述校准后的全部关键需求点（非一句概括），确认与用户真实目标一致。将用户可能失准的表达翻译为精准、无歧义、可落地执行的目标，并主动补全与完善。

三、纠偏不迎合。发现用户判断、假设或表达存在逻辑或事实缺陷时直接指出并给出理由；只依据逻辑与事实，不做心理分析、不谈情绪、不软化结论。

四、带答案确认，必要时提问。凡需用户裁决处，附上己方推定答案供其判断，而非空手索取内容。若信息仍不足以做对，可提问，单轮不超过 5 个，问题须具体、锋利、能推进判断；能不问则不问。

五、术语零门槛。用户不懂编程。面向用户的一切输出中，凡出现专业术语、英文缩写或技术黑话，必须就地用大白话解释清楚，并说明它对用户的实际影响；不得默认用户理解。仅供 AI 内部使用、用户不阅读的内容不受此限。

### 核心原则

- 项目规则以本文件和当前代码为准；旧设计文档、历史记忆、任务摘要只能当线索。
- 阿禅不写代码。回复要中文、简短、直接；必要术语要顺手解释。
- 需求明确就直接做；涉及大改、配置、规则、部署链路、线上数据时，先给方案和风险，再等确认。
- 信息不足会导致做错时，先一次性问清；进入执行后独立排查到结果。

------

## 三、项目事实

### 产品信息

- 产品：抖音数据日报平台。
- 域名：`dydata.cc` / `dydata.vercel.app`。

### 技术栈与部署

- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel。
- 部署：Vercel 是唯一正式部署平台；`main` 分支 push 会触发线上部署。仓库里的 OpenNext/Cloudflare 配置只按历史残留或实验配置处理，不能改成正式部署方案。
- 主库：Supabase `gcrhhxaopomtposmahsw`，新加坡区。

### 环境变量

- 公开：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- 服务端：`SUPABASE_SERVICE_ROLE_KEY`、`FEISHU_WEBHOOK_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_APP_ENCRYPT_KEY`、`FEISHU_APP_VERIFICATION_TOKEN`、`CRON_SECRET`、`REMIND_SECRET`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`DYDATA_PERF_LOG`。
- 数据库/CLI：`SUPABASE_DB_URL`、`SUPABASE_ACCESS_TOKEN` 只用于迁移或临时 SQL，不进代码。
- 默认值以 `.env.example` 和实际 `.env.local` 为准，不从旧记忆抄。

### 权限模型

- 数据库 `role` 只有三种：`owner` / `admin` / `member`。
- 业务统一看 `businessRole`：`owner` / `team_admin` / `group_leader` / `member`。
- `owner` 全局权限；`team_admin` = `admin` + `manage_members=true`；`group_leader` = `admin` + 是某组 `leader_user_id`；其他为 `member`。
- 权限开关统一来自 `PERMISSION_KEYS`。`admin` 和 `member` 可授权范围相同，区别在默认值。
- 首个 `owner`：`1305085564@qq.com`。

------

## 四、页面与路由

### 公开页面

- `/`、登录注册、找回/重置密码。

### 登录后页面

- `/dashboard`、`/growth`、`/violations`、`/video-review`、`/content-tools`。

### 管理后台

- `/admin` 重定向到 `/admin/content`；核心顶部入口是 `/admin/content`、`/admin/videos`、`/admin/analytics`、`/admin/fulfillment`。
- 仍存在但不是核心顶部入口：`/admin/settings`、`/admin/modules`、`/admin/ai-config`、`/admin/guidance`、`/admin/advice`。
- `/content-tools/rewrite-v3` 只做兼容重定向到 `/content-tools/rewrite`。
- `/playground/navigation` 是开发预览页，不当正式业务入口。

### 定时任务

- Vercel 当前只注册两个 cron：`/api/supabase-keepalive` 每天 14:30（北京时间），`/api/notifications/cleanup` 每天 02:00（北京时间）。
- cron 鉴权兼容 `CRON_SECRET` 和 `REMIND_SECRET`，实现看 `src/lib/cron-auth.ts`。
- `/api/remind`、`/api/report`、`/api/smart-alert`、`/api/admin/first-screen-monitor` 等接口有 cron 鉴权，但没有出现在 `vercel.json` 时，只能当手动或外部触发，不能说 Vercel 正在自动跑。

------

## 五、开发规范

### 架构与性能

- 改到核心页面的加载器、依赖表、首屏接口后，必须当场同步更新总纲「架构地图」；每次性能优化必须补总纲「实测台账」一行。
- 总纲描述与代码冲突时，一律以代码为准，并立即修正总纲，禁止将错就错。
- 声称「已实测某步骤耗时」前，该页面加载器必须已有对应 `[perf]` 埋点；无埋点先补埋点，否则只能记「未实测」，禁止凭猜写数字。
- 体检 Skill 不可用时，按总纲「五、排查流程」手动排查并回填台账。

### 编码规范

- `docs/plans`、`docs/reference`、`docs/archive` 是本项目固定英文目录名；其他文件和目录仍优先中文。
- 中文组件名内部用英文 PascalCase，导出时再用中文别名。
- 表单切换用 `key` 重建组件，禁止用 `useEffect` 同步 props。

### 排查顺序

- 线上问题先看 Vercel 最近部署，再区分代码、数据库、权限、缓存。
- 数据库问题先查真实字段和已执行 migration；`select` 只写线上已存在字段。
- RLS/权限问题先查 helper、policy、service role 调用链路。
- 前端传给后端的字段，如果后端没有接收逻辑，直接删或补后端，不能留幽灵字段。
- 使用项目封装 UI 组件前，先看 `components/ui/*` 的真实 Props，不能套原版 shadcn/Radix 写法。
- UI 联动要覆盖加载、空状态、折叠、选中、hover/focus 分支。

### 提交链路专项规则（2026-07-27 连续生产事故教训）

凡涉及"组员提交/替换/重试"类接口，动手前必须对照以下检查项：

1. **含新字段必须发布三连**：① 生产执行 migration → ② 刷新 PostgREST schema cache → ③ 真实角色 API 实测。三步缺任一不算完成，日志里必须写明三步均已完成。
2. **delete + insert 替换模式，先确认 DELETE RLS 存在**：在 `supabase/migrations/` 里 grep 该表的 `FOR DELETE` policy。无策略时，delete 静默成功但影响 0 行，insert 随即撞唯一约束——错误表面是"重复键"，根因是"旧数据未删"。涉及 `video_tags`、`video_metrics_snapshots`、`video_content_segments` 等表时尤其注意。
3. **rollbackSafely 返回值不能丢弃**：调用后必须 `const rbErr = await rollbackSafely(...); if (rbErr) console.error("[接口名] rollback failed", rbErr);`。回滚失败时第一个业务错误仍然返回给调用方，rollback 错误另行记录，两者都不能丢。
4. **多表回滚操作走 service role**：`video_metrics_snapshots`、`video_tags` 等无成员 DELETE RLS 的表，回滚删除必须用 `adminSupabase`，不能用 `supabase`（user client），否则 delete 静默 0 行，造成半提交残留。
5. **稳定 PK 重试必须覆盖五种状态**：用 `buildSubmissionRecordId` 生成固定 ID 的提交接口，验收时必须人工模拟：active（正常更新）、trashed（恢复后更新）、purged（应拒绝，返回 409）、他人占用（返回 409）、并发提交（两个相同请求同时到达），五种都要覆盖，不能只测正常路径。
6. **成员相关修复，必须用普通组员账号验收全链路**：任何影响成员权限或提交的修复，验收方式必须是用真实普通组员（有 `team_id` 或 `group_id` 的 `member` 账号）走完完整提交流程，不能只用 owner/admin 测。测试账号见 `~/.claude/projects/-Users-mac-Projects-dydata/memory/测试账号-选题库.md`（待补充提交链路专用账号）。

### 废弃机制

- 不从旧设计文档里恢复功能，必须先用当前代码验证是否上线。
- `sop_review_scores` 六维评分不参与当前视频复盘主流程；当前视频复盘以 `content_feedback_cards` 为主。
- SOP 5 卡点状态追踪、审核中心、全域矩阵未作为当前 dashboard 入口上线。
- 旧 AI 配置入口 `/admin/ai-channels`、`/admin/ai-features` 统一重定向到 `/admin/ai-config`。

------

## 六、部署与 Git

### 禁止误操作

- 所有代理在本地主项目目录工作，禁止沙箱 / worktree / 隔离环境；改动不是本地立刻可见的，必须明文提醒阿禅。
- 任务完成后提醒阿禅需要 push，不阻塞流程。
- 禁止把 Git remote 改成 HTTPS；本仓库默认 SSH remote：`git@github.com:1305085564-hue/dydata.git`。
- `git config user.email` 必须是 `1305085564@qq.com`。

### Git 收尾

- push / pull / fetch 前先检查 `git remote -v`、`ssh -T git@github.com`、`git ls-remote origin`。
- SSH 失败先修 SSH，不改 HTTPS 兜底。
- push 后必须汇报本次文件、提交号、验证结果，并核对云端 `main` 已是该提交；缺任一项都不能称为已发布。

------

## 七、协作分工

### 三方代理

- Claude Code（约 20%）：总览与统筹，负责架构设计与 0→1 需求探索；与用户交互最多，负责阶段总结与对齐。
- Antigravity（约 30%）：仅负责前端的「怎么看起来」——视觉风格、动效节奏、布局适配、交互手感；遇代码逻辑问题交 Codex。
- Codex（约 50%）：负责所有代码的「怎么跑起来」——逻辑、数据、接口、功能 bug（含前端组件逻辑）；遇审美需求交 Antigravity。
- 跨领域任务不互相直接调用，一律产出可移交的提示词交用户转派。

### 日志规则

- 本项目所有日志统一写入 `日志/YYYY-MM-DD.md`，所有 agent 共用，按时间线记录关键结论，任务完成必写。
- 主日志：每次任务完成后追加，记结论/事件，一行一条，带时间（要能扫一眼知道：背景 / 已完成 / 当前状态 / 未完成线索）
- 补充日志：同目录 YYYY-MM-DD-补充.md，记关键细节/过程/上下文
- 前缀：Claude Code 写 `[CC]`，Codex 写 `[CX]`，Antigravity`[An]`（共用同一份日志）
