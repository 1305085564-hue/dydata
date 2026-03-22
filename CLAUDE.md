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
| /login | 登录（blur 入场 + focus line） | 公开 |
| /register | 注册（邀请码 + 密码强度条） | 公开 |
| /dashboard | 员工填报（账号选择+截图OCR识别）+ 趋势图 + 排行榜 + 历史 | 登录 |
| /growth | 成长分析（状态卡+诊断+标杆+PK+样本库+AI建议） | 登录 |
| /admin | 管理后台（双视角按人/按账号 + 豁免 + 权限批量保存） | admin/owner |
| /admin/analytics | 经营分析（趋势图重构 + 人员折叠 + 爆款/时间/AI洞察） | admin/owner |

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

## 当前状态（2026-03-22）
- 阶段一 + 阶段1.5 P0-P4 全部完成，已部署上线
- migration 001-018 全部已执行（线上）
- 阶段三执行提示词全套备好，待启动（批次零+批次一可立即跑）
- git config user.email = 1305085564@qq.com（Vercel Hobby 要求）
- git remote 已切 SSH：git@github.com:1305085564-hue/dydata.git
- 最新已知 commit：4da9e0b（03-17 收口）

### 3/17 凌晨大型优化改造（commit 0ac9569 → 8a78c08 → 4da9e0b）
第一批（地基层）：
- 账号体系拆分（accounts 表，人-账号一对多，标签）
- 涨粉/导粉字段 + 时间逻辑（published_at 默认昨天，uploaded_at 系统写入）
- 豁免机制升级（永久/临时，带原因，催交适配）
- 手机端蓝点修复（导航栏 fixed + 安全区 + z-index）
- 权限编辑提速（批量编辑+一次保存）
- migration: 008（豁免）+ 009（账号）+ 010（涨粉/上传时间）

第二批（功能+组件层）：
- 趋势图重构（result-trend + interaction-trend，recharts + framer-motion）
- 排行榜重做（总榜/同标签/进步榜，按 account 维度）
- 人员折叠 + 管理后台双视角（按人/按账号）
- /growth 骨架 + 数据层 + metrics.ts
- 截图识别导入（OCR vision API + 置信度展示）
- PK 对比组件（1v1/vsTeam，8维对比，对战条动效）
- AI 行动建议 API（诊断/参考/动作 3 段结构）
- 标杆画像卡 + 样本库 + 诊断卡
- migration: 012（排行榜函数）

收尾组装：
- /growth 页面组装（growth-client.tsx，接通所有组件）
- findBenchmarks 补全

### 3/17 上午视觉质感升级（执行中）
计划文档：DESIGN-UPGRADE.md
- ✅ CC-α：全站动效核心增强（滚动触发 whileInView、stagger staggerChildren、路由转场 template.tsx、hover 增强）
- ✅ CC-γ-v2：登录注册+全局收尾（光斑背景、blur 过渡、密码强度条、安全区、ScrollToTop、Toast 毛玻璃）
- 🔄 CC-β-v2：图表动效升级（AnimatedNumber 重构、画线动画、shimmer 骨架屏）
- 待做：三 CC 收口后统一审查 → git push → 部署

## 待做

### 管理运营
- [ ] 管理员首批 4-5 人开通 + cron job

### DYData 阶段三执行计划（2026-03-21 规划）

提示词文件均在 `~/.openclaw/workspace/memory/领域-思流/1、💭 一念/`

**执行顺序**
- 批次零 + 批次一（A1/A2/A3）→ 可同时跑
- 批次二（B/C/D/E/F/G，6并行）→ 批次一完成后启动
- 批次三（H1/H2/H3，3并行）→ 批次二完成后启动

| 批次 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 零 | 批次零-UI素材预备-GPT5.4.md | [ ] 待执行 | Mac风格设计底座 |
| 一-A1 | 批次一-A1-地基核心数据表.md | [ ] 待执行 | migration 019-022 |
| 一-A2 | 批次一-A2-文案标签AI表.md | [ ] 待执行 | migration 023-027 |
| 一-A3 | 批次一-A3-权限团队豁免日志表.md | [ ] 待执行 | migration 028-032 |
| 二-B | 批次二-B-数据填报页重构.md | [ ] 待执行 | 多图上传+状态机 |
| 二-C | 批次二-C-管理后台重构.md | [ ] 待执行 | 豁免+分页+踢人 |
| 二-D | 批次二-D-成长分析页重构.md | [ ] 待执行 | 六维+对标+PK |
| 二-E | 批次二-E-AI洞察底座.md | [ ] 待执行 | 固定Prompt结构 |
| 二-F | 批次二-F-排行榜趋势图标签UI.md | [ ] 待执行 | 排行榜10列+Y轴 |
| 二-G | 批次二-G-数据分析页权限布局演示团队.md | [ ] 待执行 | 权限+演示团队 |
| 三-H1 | 批次三-H1-Toast反馈统一.md | [ ] 待执行 | 全站Toast |
| 三-H2 | 批次三-H2-空白态补全.md | [ ] 待执行 | 空白/异常/加载态 |
| 三-H3 | 批次三-H3-移动端适配.md | [ ] 待执行 | 移动端 |

**关键决策**
- 技术方案 → GPT-5.4；流量AI方案 → Gemini；全部执行 → GPT-5.4
- AI洞察必须结构化输入+固定Prompt，禁止自由发挥
- UI动效10条验收底线写死，不达标=重做
- Mac风格：#f5f5f7背景/苹果蓝#007AFF/cubic-bezier(0.16,1,0.3,1)
- 动效规范注入所有批次：00-UI动效标准-必须注入所有批次.md

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
