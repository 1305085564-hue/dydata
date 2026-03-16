# DYData 项目记忆

## 自我进化机制

### 每次任务结束前，执行三步反思
1. **发生了什么？** 这次任务遇到了什么问题？走了哪些弯路？
2. **根因是什么？** 不是"代码写错了"这种表面原因，而是"为什么会写错"——是缺少信息？假设错误？排查顺序不对？
3. **下次怎么避免？** 提炼成一条可执行的规则，写入下方「踩坑记录」或「排查方法论」

### 触发条件
- 修了 bug → 必须反思（尤其是改了多次才修好的）
- 部署失败 → 必须反思
- 阿禅说"不对"或"还是有问题" → 必须反思
- 排查超过 3 轮还没定位 → 暂停，先反思排查思路再继续

### 写入规则
- 踩坑（具体事实）→ 加到「关键踩坑」表
- 方法论（通用思维）→ 加到「排查方法论」
- × 记流水账，只记结论
- × 重复已有条目，先检查是否已存在类似经验

### 反面教材（× 不要这样做）
- × 反复改代码碰运气，不先定位根因
- × 本地能跑就认为没问题，不确认线上版本
- × 只看代码不看数据库（RLS/migration/函数版本）
- × 遇到报错就改代码，不先看报错信息说了什么

## 基本信息
- 名称：抖音数据日报平台
- 代码：~/Projects/dydata/
- 域名：dydata.cc / dydata.vercel.app
- Supabase：mkkvnogkqcupvxmnoefy.supabase.co（印度孟买区）
- 启动日期：2026-03-15

## 技术栈
- Next.js App Router + Tailwind CSS + shadcn/ui
- Supabase（PostgreSQL + RLS）
- Vercel（部署）+ Cloudflare（DNS/CDN）
- 飞书群机器人 webhook
- AI 洞察：OpenAI 兼容接口（aiapikey.net 中转）

## 页面结构
| 路径 | 说明 | 权限 |
|------|------|------|
| /login | 登录 | 公开 |
| /register | 注册（邀请码） | 公开 |
| /dashboard | 员工填报 + 趋势图 + 排行榜 + 历史 | 登录 |
| /admin | 管理后台（状态/仪表盘/成员/数据管理/导出/邀请码/日志） | admin/owner |
| /admin/analytics | 数据分析（爆款/人员/时间/AI洞察） | admin/owner |

## 数据库
- 表：profiles / daily_reports / invite_codes / audit_logs
- 函数：validate_invite_code() / get_today_submission_status()
- Migration 执行状态：001-007 全部已执行

## 角色权限体系（P5，2026-03-16 完成）
- owner：创始人，唯一，所有权限
- admin：管理员，权限由 owner 通过 checkbox UI 配置
- member：普通成员，只能填报和查看自己数据
- 权限字段：profiles.permissions jsonb，7个 key：view_all_data / edit_data / export_data / manage_invite / view_analytics / view_audit_log / manage_members
- 默认管理员权限：view_all_data=true, export_data=true, view_analytics=true，其余 false

## 定时任务
| 任务 | 时间 | 来源 |
|------|------|------|
| 每日催交 | 每天 11:15 | Vercel cron |
| 周报 | 每周一 9:00 | OpenClaw cron |
| 月报 | 每月1号 9:00 | OpenClaw cron |

## 环境变量
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- FEISHU_WEBHOOK_URL
- CRON_SECRET
- REMIND_SECRET
- AI_BASE_URL=https://www.aiapikey.net
- AI_API_KEY=sk-luu389f...（api7）
- AI_MODEL=claude-sonnet-4-6

## 外部服务
- Cloudflare NS：aron/hal.ns.cloudflare.com
- 飞书 webhook：已配置到环境变量
- 首个管理员：1305085574@qq.com

## 当前状态（2026-03-16）
- P1-P5 全部完成，已部署上线
- migration 007 已执行，阿禅 role=owner
- git config user.email 已设为 1305085564@qq.com（Vercel Hobby 要求）
- 飞书催交验证通过：临时制造 1 条未提交后，`/api/remind` 正确返回 `十八`，随后已恢复数据
- 飞书日报提交通知验证通过：真实新增提交触发绿色卡片 `✅ 日报提交通知`
- `/api/report` 周报、月报接口本地验证通过
- 已清理 8 条旧测试邀请码

## 待做
- [ ] 管理员首批 4-5 人开通 + cron job
- [ ] 后续迭代：内容标签体系、发布时间自动解析、analytics 结论优先

## 关键踩坑
| 问题 | 根因 | 修复 |
|------|------|------|
| 邀请码查不到 | anon key 不完整 + RLS | 补全 key + validate_invite_code() SECURITY DEFINER |
| profile 未创建 | 邮箱确认开启导致 session 为空 | 关闭邮箱确认 + 调整注册顺序 |
| submitter 为空 | 表单未传字段 | 从 profiles 自动查姓名 |
| 国内打不开 | Vercel 被墙 | Cloudflare DNS 代理 |
| 异常检测误报 | 数据不足 | ≥3 天数据才标记 |
| Vercel 部署失败 | git author email 是 mac@192.168.1.147，Hobby 计划要求匹配 GitHub 账号 | `git config user.email "1305085564@qq.com"` 后重新提交 |
| owner 看不到管理后台 | 部署失败 → 线上跑旧代码（login 只认 admin 不认 owner） | 修复部署后自动解决 |
| cron 接口返回 Unauthorized | 项目记忆写的是 `CRON_SECRET`，代码早期只认 `REMIND_SECRET` | `/api/remind`、`/api/report` 改为兼容 `CRON_SECRET ?? REMIND_SECRET` |
| cron 报表接口查不到数据 | 定时接口用 anon key 读 `daily_reports`，受 RLS/权限影响 | 服务端接口优先改用 `SUPABASE_SERVICE_ROLE_KEY` |
| dashboard 页面 build 失败 | `page.tsx` 里复用同名解构变量 `todayReports`，修完后继续暴露出 Select 组件 `onValueChange` 类型不兼容 | 先按编译报错逐个收口：重命名冲突变量，再把 `onValueChange` 改成显式兜底 `null` 的回调 |
| React Hooks lint 误报/回填状态错乱 | 中文导出组件名未被 lint 识别为 Hook 组件，且表单局部 state 依赖 `useEffect` 同步 props 容易触发 `set-state-in-effect` | 内部组件名改成英文 PascalCase 再导出中文别名；表单切换时优先用 `key` 重建组件，避免用 effect 同步初始化 state |
## 排查方法论（遇到线上问题时按顺序检查）

1. **先确认线上跑的是哪个版本**
   - 部署平台（Vercel）最近一次部署是否成功？
   - 线上代码 ≠ 本地代码是最常见的"代码没问题但不生效"的原因
2. **区分代码问题 vs 数据库问题**
   - 代码：本地 build 能过吗？逻辑链路完整吗？
   - 数据库：migration 真的执行了吗？函数是新版还是旧版？RLS 策略是否阻拦？
3. **RLS 排查三板斧**
   - 查 is_admin() 等 helper 函数是否包含新角色
   - 查 RLS policy 的 USING 条件
   - 用 service_role key 绕过 RLS 验证是否是权限问题
4. **Vercel 部署失败常见原因**
   - git author email 不匹配 GitHub 账号（Hobby 计划限制）
   - 环境变量缺失导致 build 报错
   - Node 版本不兼容
5. **× 反复改代码碰运气** → 先定位根因再动手

## 已安装 Skills（.claude/skills/）

以下 skill 已安装到项目，执行任务时自动遵守：

### nextjs-best-practices
- Server Component（默认）vs Client Component（'use client'）：按需拆分
- 数据获取在 Server Component 做，交互逻辑在 Client Component 做
- 布局用 layout.tsx，loading/error 用约定文件
- 避免在 Client Component 里直接 fetch 数据库

### nextjs-supabase-auth
- 用 @supabase/ssr 做 App Router 集成
- middleware 里刷新 session + 保护路由
- Server Actions 处理认证操作
- × 把 auth token 暴露给客户端

### verification-before-completion
- 声称"完成"之前必须跑验证命令（build/test/curl）
- 没跑过验证 = 不能说完成
- 流程：确定验证命令 → 执行 → 读完整输出 → 确认通过 → 才能声称完成

### systematic-debugging
- 遇到 bug 先定位根因，× 猜测性修复
- 流程：复现 → 收集证据 → 缩小范围 → 找到根因 → 才能动手修
- 尤其在时间压力下更要遵守（越急越不能瞎改）

### 前端/UI/动效类（10 个）
- **frontend-design**: 生产级前端界面，避免 AI 通用审美，追求独特设计感
- **ui-ux-pro-max**: 50+ 风格、21 调色板、50 字体搭配、shadcn/ui 深度集成
- **tailwind-patterns**: Tailwind CSS v4，CSS-first 配置、容器查询、设计 token
- **scroll-experience**: 滚动驱动动画、视差效果、沉浸式叙事体验
- **3d-web-experience**: Three.js / React Three Fiber / WebGL 3D 交互
- **mobile-design**: 移动端优先设计思维、触控交互、平台规范
- **web-design-guidelines**: Web 界面设计规范审查
- **theme-factory**: 10 套预设主题，可应用到任何页面
- **accessibility-auditor**: WCAG 无障碍审计
- **claude-d3js-skill**: D3.js 交互式数据可视化

### 框架/性能类（6 个）
- **react-patterns**: 现代 React Hooks、组合、性能、TypeScript
- **react-ui-patterns**: 加载状态、错误处理、异步数据 UI 模式
- **core-web-vitals**: LCP/INP/CLS 优化
- **performance**: 网页性能优化（加载速度、页面速度）
- **vercel-deployment**: Vercel 部署最佳实践
- **clean-code**: 简洁代码标准，× 过度工程

### 数据库（1 个）
- **supabase-postgres-best-practices**: Postgres 查询优化、索引策略、RLS

### 工程质量类（5 个）
- **production-code-audit**: 全代码库深度扫描，升级到生产级质量
- **code-reviewer**: 代码审查（安全/性能/可维护性）
- **test-driven-development**: TDD 红绿重构
- **error-resolver**: 系统化错误诊断
- **lint-and-validate**: 自动质量控制和静态分析

### 工具类（3 个）
- **mermaid-diagrams**: Mermaid 图表（架构/流程/ER/序列图）
- **dispatching-parallel-agents**: 多任务并行子代理调度
- **git-pushing**: git commit + push 规范
