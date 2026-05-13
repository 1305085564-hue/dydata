# DYData 项目规则

## 基本信息
- 名称：抖音数据日报平台
- 域名：`dydata.cc` / `dydata.vercel.app`
- Supabase：`mkkvnogkqcupvxmnoefy.supabase.co`
- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel
- 部署平台：Vercel，`push main` 自动部署，不要擅自改成其他部署方案

## 关键规则
- `git config user.email` 必须是 `1305085564@qq.com`
- 服务端接口使用 `SUPABASE_SERVICE_ROLE_KEY`，不要误用 anon key
- cron 接口兼容 `CRON_SECRET` 和 `REMIND_SECRET`
- 不改旧 migration，只能新增 migration
- 不改线上 `.env`
- 配置类改动前先读原配置，不要顺手重构

## 角色权限
- 代码 `role` 只有三种：`owner` / `admin` / `member`
- 业务按四级理解：`owner` 全局最高；负责人 = `admin` + `manage_members=true`；组长 = `admin` + `groups.leader_user_id`；组员 = `member`，默认无权限，可授权
- 权限开关看 `permissions`，范围看 `team_id` / `group_id` / `groups.leader_user_id`
- `admin` 和 `member` 可授权范围相同，都是 `PERMISSION_KEYS`
- 区别只在默认值，不在可授权范围
- 首个 `owner`：`1305085564@qq.com`

## 环境变量
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FEISHU_WEBHOOK_URL`
- `CRON_SECRET`
- `REMIND_SECRET`
- `AI_BASE_URL=https://www.aiapikey.net`
- `AI_API_KEY`
- `AI_MODEL=claude-sonnet-4-6`

## 页面结构
- `/login`、`/register`：登录注册
- `/dashboard`：员工填报、趋势图、排行榜
- `/growth`：成长分析
- `/analytics`：数据分析
- `/admin`：管理后台
- `/admin/analytics`：经营分析

## 定时任务
- 每日催交：每天 11:15，Vercel cron
- 周报：每周一 9:00，外部 cron
- 月报：每月 1 日 9:00，外部 cron

## 排查方法
1. 先确认 Vercel 最近部署是否成功。
2. 先区分代码问题和数据库问题。
3. 遇到 RLS 问题时，优先检查 helper、policy `USING`、service role 调用链路。
4. `select` 只查询实际存在且已执行 migration 的字段。
5. 不要靠反复改代码碰运气，先定位根因。
6. Next.js RSC 组件传递类型如果少了必填 props，跨 agent 修改时会导致连锁 TS 错误，需保证共用类型定义的稳定性。
7. React 严格模式下 hooks 依赖规则校验严格，如果必须在 useEffect 里 setState，需加 `// eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect` 注释避免 lint 阻断部署。
8. 调用项目内封装的 headless 组件（基于 Radix/Base-ui）前，花 10 秒看一眼 `components/ui/xxx.tsx` 的类型定义和实际结构，避免 asChild/render 等 Props 被魔改。
9. 开发 Focus、Hover 或选中联动反馈时，检查目标区块在所有 `if-else` 和状态分支（折叠、加载中、空占位）的表现，确保反馈不断裂。
10. Claude Code 启动时如果 cwd 是家目录，先读 `~/.claude/memory/MEMORY.md` 找活跃项目指针，不要直接说"不知道哪个项目"。
11. 动 UI 前先读目标页面的设计文档（产品定位、能力边界、信息架构）。视觉标准可共享，功能模块必须按各页面独立定位设计。前端传到 request body 的字段如果后端不接收（grep 无命中），立刻删，这是错搬/幽灵功能的危险信号。

## 前端协作
- 多批次前端改动默认走 Gemini + Codex 联动：Gemini 先出分批方案 → 我把关纠偏 → Gemini 按确认方案执行 → Codex 审代码 → 再决定补问题还是进下一轮
- 标准文档：`docs/前端-Gemini-Codex联动流程.md`
- **美学规范**：前端改造须对照两个文件（按顺序）
  1. `~/.claude/memory/阿禅美学-V1.2.md` — 设计偏好与方向判断（哲学层）
  2. `~/.claude/memory/阿禅美学标准-V1.2.md` — 量化执行硬规（字号/间距/色值/禁区）
  参考：`~/.claude/memory/阿禅美学附件-V1.2.md`（grep 验收 / 版本史，非强制）

## Skill 使用
- 前端页面、UI、布局、样式、交互类任务，先默认用 `frontend-skill`，不要一上来直接写代码
- 需要落代码时，再接 `frontend-design`
- 涉及动效、入场、悬停、展开收起、滚动表现时，补 `motion` 和 `interaction-design`
- 前端逻辑、状态、性能、组件拆分、重渲染问题，优先看 `react-patterns`
- 改完前端后，必须做真实浏览器验收；需要时用 `browser-testing-with-devtools`，再按需补 `responsiveness-check`
- 只要是完整页面或明显的 UI 重构，先把 skill 路由说清楚，再开始动手

## Git SSH 固定规则
- 这个仓库默认只使用 SSH remote：`git@github.com:1305085564-hue/dydata.git`
- 未经用户明确同意，不允许把 remote 改成 HTTPS
- 在任何 `git push`、`git pull`、`git fetch` 前，必须先检查：
- `git remote -v`
- `ssh -T git@github.com`
- `git ls-remote origin`
- 如果 SSH 失败，先修 SSH 配置和 GitHub key 绑定，不允许直接改走 HTTPS 兜底
- 当前固定私钥路径：`C:\Users\25417\.ssh\id_ed25519`
- 当前固定 GitHub SSH 配置文件：`C:\Users\25417\.ssh\config`

## AI 协作元规范

以下 6 条为最高优先级协作规则，与既有技术规则冲突时以此为准。

1. 先思后答
每次回答前完成推演。第一步不是顺着表述直接回答，而是判断真实要解决的核心问题是什么，识别隐含假设和信息缺口。

2. 不全则问
若目标、背景或成功标准模糊，禁止直接产出。优先提出 1-3 个最关键的问题来澄清。问题要具体、锋利，能推进思考。

3. 纠偏不迎合
若发现判断、假设或提问方式存在明显问题，直接指出并说明理由。只聚焦逻辑和事实，不做心理分析，不讨论情绪。

4. 极简交付
只输出当前阶段最必要的模块。默认输出判断结论和下一步行动，其余仅在必要时展开。输出前自检，删除所有可删除的形容词、过渡句和重复论证。

5. 格式铁律
强段落式论述，每段完整表达一个意思，禁止碎片化换行。全篇不超过两级标题。复杂对比用表格，其余用段落。禁止 emoji、网络口语和过度寒暄。

6. 长程一致性
多轮任务中，每推进一个节点主动回顾初始约束，确保不偏离。

## AI 协作体系

### 多工具角色分工

| 工具 | 角色 | 职责边界 |
|------|------|---------|
| Claude Code | 主导 | 决策、规划、调度、复杂逻辑 |
| Codex (GPT-5.4) | 执行+审查 | 代码编写、代码审查、补丁 |
| Kimi (K2.6) | 前端执行 | 只接前端实现，不负责规划和复杂思考 |
| 小龙虾 (OpenClaw) | 规划顾问 | 内容策略、提示词、创意 |

### 记忆入口层级

- **项目级权威**：本文件（`AGENTS.md`）——所有工具优先读取
- **Claude Code 全局记忆**：`~/.claude/memory/MEMORY.md` ——跨项目长期知识、API配置、故障手册
- **日志统一写**：`~/.claude/memory/日志/YYYY-MM-DD.md` ——关键链路和持续项目只维护一份主日志

### 日志规则

- 关键链路和持续项目，只维护一份主日志
- Kimi、Codex、小龙虾都只认这一份日志，不单独维护第二份
- 补充日志入口保留为历史映射，但不再作为独立日志层

### 全局记忆索引

| 文件 | 内容 |
|------|------|
| `~/.claude/memory/MEMORY.md` | 全局索引总目录 |
| `~/.claude/memory/纠错记录.md` | 踩坑教训与排查方法论 |
| `~/.claude/memory/领域-协作/协作规则.md` | 四工具协作详细规则 |
| `~/.claude/memory/领域-协作/关键链路日志统一写主日志.md` | 日志统一策略 |
| `~/.claude/memory/Kimi子代理.md` | Kimi 前端执行入口配置 |
| `~/.claude/memory/领域-工具链/全局配置文件分工.md` | 主文件+镜像文件双轨维护规则 |
