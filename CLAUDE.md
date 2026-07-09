# DYData 项目规则

## 一、开工协议（每个任务开工第一步，不可跳过）

收到任何任务，正式动手前先当众输出「开工分诊」三行，缺一不可；三行没输出 = 没开工，禁止直接改代码：

一、领域：这活归下列哪个岗位（可多选；跨领域先拆成子任务分别分诊）。
二、已读：进入该岗位，读了它的主文档 +（按需）二级文档/skill，列出读了哪些文件名。
三、边界：本岗位不能动什么、哪部分要转派给谁。

七岗位 → 必读文档（对号入座）：

| 岗位 | 何时进入 | 主文档（必读） | 二级 / skill（按需） |
|---|---|---|---|
| 产品与信息架构 | 做不做、页面取舍、流程设计 | `docs/全站模块地图.md` | — |
| 前端工程师 | 长相、交互、动效、响应式 | `docs/美学规范.md` | 前端 skill + `docs/美学规范补充（默认不读）.md` |
| 性能工程师 | 慢、首屏、请求数、接口耗时 | `docs/架构与性能总纲.md` | skill「网站体检」 |
| 后端与数据工程师 | 接口、数据准不准、查询、AI 接口 | `docs/后端与数据说明.md` | `docs/数据口径.md` + supabase 两个 skill |
| 权限与安全工程师 | 谁能看/能改、后台权限、RLS | `docs/权限与安全说明.md` | — |
| 部署运维工程师 | Vercel/Supabase/域名/回滚/线上故障 | `docs/运维排查手册.md` | skill「vercel-deploy」 |
| 代码治理工程师 | 文件分类、模块边界、改动能否一起发 | `docs/代码治理手册.md` | — |

分诊铁律：

- 任务清晰单一 → 直接分诊进场，别为问而问。
- 跨领域、或自己拿不准归哪个岗位 → 把分诊判断先报阿禅确认，再动手。
- 一个子任务只进一个岗位，不越界；跨领域先拆。
- 阿禅监督位：AI 没报这三行就动手，即为违规，当场喊停。
- 本节定「进场流程」，第二节元约束定「行为准则」；分诊完成后一切执行遵循元约束，两者冲突以元约束为准。

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
- 服务端：`SUPABASE_SERVICE_ROLE_KEY`、`FEISHU_WEBHOOK_URL`、`CRON_SECRET`、`REMIND_SECRET`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`DYDATA_PERF_LOG`。
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

### 架构治理（全局视野，最高优先）

- 性能 / 架构 / 慢页面 / 加接口 / 改数据加载类任务，动手前必须先读 `docs/架构与性能总纲.md`，按其「岗位分诊」定领域、「架构地图」查依赖、「排查流程」定位问题。
- 判断"某功能/页面/接口属于哪个模块、是否已废弃、坏了会连累谁"，先查 `docs/全站模块地图.md`；禁止从旧文档恢复该图已标废弃/重定向的功能。
- 线上故障（白屏/登录异常/接口报错/回滚）先读 `docs/运维排查手册.md`，按症状分诊与回滚规范处理；上线后立刻出问题优先回滚再查根因。
- 一个任务只落一个领域，不越界：性能任务不改业务规则，前端任务不碰接口和数据库，反之亦然。跨领域先拆。
- 改到核心页面的加载器、依赖表、首屏接口后，必须当场同步更新总纲「架构地图」；每次性能优化必须补总纲「实测台账」一行。
- 总纲描述与代码冲突时，一律以代码为准，并立即修正总纲，禁止将错就错。
- 声称「已实测某步骤耗时」前，该页面加载器必须已有对应 `[perf]` 埋点；无埋点先补埋点，否则只能记「未实测」，禁止凭猜写数字。
- 一键体检：Claude Code 环境走 skill「网站体检」自动完成实测分诊与台账回填；不支持该 skill 的 AI（如 Codex）按总纲「五、排查流程」手动逐步走，结果同样回填台账。

### Skill 优先

- 执行任何任务前，强制对照可用 skill 列表匹配最佳 skill；匹配成功必须先调用 skill 再行动。
- 未匹配或不确定时暂停询问，禁止绕过 skill 直接编码。

### 前端规则

- 前端改造先读 `docs/美学规范.md`；需要具体参数时再读补充文档。
- 页面、布局、交互、动效类任务先说明 skill 路由，再执行。
- 改完前端必须做真实浏览器验收；页面重构要补响应式检查。

### 编码规范

- 中文组件名内部用英文 PascalCase，导出时再用中文别名。
- 表单切换用 `key` 重建组件，禁止用 `useEffect` 同步 props。

### 排查顺序

- 线上问题先看 Vercel 最近部署，再区分代码、数据库、权限、缓存。
- 数据库问题先查真实字段和已执行 migration；`select` 只写线上已存在字段。
- RLS/权限问题先查 helper、policy、service role 调用链路。
- 前端传给后端的字段，如果后端没有接收逻辑，直接删或补后端，不能留幽灵字段。
- 使用项目封装 UI 组件前，先看 `components/ui/*` 的真实 Props，不能套原版 shadcn/Radix 写法。
- UI 联动要覆盖加载、空状态、折叠、选中、hover/focus 分支。

### 废弃机制

- 不从旧设计文档里恢复功能，必须先用当前代码验证是否上线。
- `sop_review_scores` 六维评分不参与当前批改台主流程；当前批改台以 `content_feedback_cards` 为主。
- SOP 5 卡点状态追踪、审核中心、全域矩阵未作为当前 dashboard 入口上线。
- 旧 AI 配置入口 `/admin/ai-channels`、`/admin/ai-features` 统一重定向到 `/admin/ai-config`。

------

## 六、部署与 Git

### 禁止误操作

- 禁止自动或私自 push `main`。需要 push 时，先提醒阿禅确认。
- 禁止改线上 `.env`。
- 禁止改旧 migration；数据库结构变更只能新增 migration。
- 禁止把 Git remote 改成 HTTPS；本仓库默认 SSH remote：`git@github.com:1305085564-hue/dydata.git`。
- `git config user.email` 必须是 `1305085564@qq.com`。

### Git 收尾

- push / pull / fetch 前先检查 `git remote -v`、`ssh -T git@github.com`、`git ls-remote origin`。
- SSH 失败先修 SSH，不改 HTTPS 兜底。
- 任务完成只汇报本次改动、验证结果、是否还没 push。

------

## 七、协作分工

### 三方代理

- Claude Code（约 20%）：总览与统筹，负责架构设计与 0→1 需求探索；与用户交互最多，负责阶段总结与对齐。
- Codex（约 40%）：任务落地与 1→10 执行。禁止触碰前端；遇前端需求，产出提示词交用户转给 Antigravity。
- Antigravity（约 40%）：仅负责前端 UI/UX；遇复杂逻辑或业务，产出提示词交用户转给 Codex。
- 跨领域任务不互相直接调用，一律产出可移交的提示词交用户转派。
