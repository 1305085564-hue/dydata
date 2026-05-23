# DYData 项目规则

## 基本信息
- 名称：抖音数据日报平台
- 域名：dydata.cc / dydata.vercel.app
- Supabase：mkkvnogkqcupvxmnoefy.supabase.co（印度孟买区）
- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel
- 部署平台：Vercel（push main 自动部署），× Cloudflare Workers
- 域名 DNS 在 Cloudflare，但部署 × 走 Cloudflare Workers

## 角色权限
- 代码 role 只有三种：owner / admin / member
- 代码统一用 businessRole 表达四级：owner / team_admin / group_leader / member
- owner 全局全权限；负责人 = admin + manage_members=true，团队内管理等同 owner；组长 = admin + groups.leader_user_id，负责本组内容和数据；组员 = member
- 权限开关看 permissions，范围看 team_id / group_id / groups.leader_user_id
- 默认值：owner 永远全权限；负责人缺失权限默认 true、显式 false 保留；组长默认内容/数据/文案能力；组员默认无权限
- admin 和 member 可授权范围相同，都是 PERMISSION_KEYS
- 区别只在默认值，不在可授权范围
- 首个 owner：1305085564@qq.com（profiles.id = a689874f-12f1-43e1-8e20-87e2195fe041）

## 环境变量
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- FEISHU_WEBHOOK_URL / CRON_SECRET / REMIND_SECRET
- AI_BASE_URL=https://www.aiapikey.net / AI_API_KEY / AI_MODEL=claude-sonnet-4-6

## 页面结构
| 路径 | 说明 | 权限 |
|------|------|------|
| /login, /register | 登录/注册 | 公开 |
| /dashboard | 员工填报 + 趋势图 + 排行榜 | 登录 |
| /growth | 成长分析（诊断+标杆+PK+AI建议） | 登录 |
| /analytics | 数据分析（member只看自己） | 登录 |
| /admin | 管理后台（豁免+权限+踢人） | 按 businessRole + permissions |
| /admin/analytics | 经营分析（趋势+爆款+AI洞察） | 按 businessRole + permissions |

## 定时任务
| 任务 | 时间 | 来源 |
|------|------|------|
| 每日催交 | 每天 11:15 | Vercel cron |
| 周报 | 每周一 9:00 | OpenClaw cron |
| 月报 | 每月1号 9:00 | OpenClaw cron |

## 排查方法论
1. 先确认线上版本（Vercel 最近部署是否成功）
2. 区分代码问题 vs 数据库问题（migration 执行了吗？RLS？）
3. RLS 三板斧：查 helper 函数 → 查 policy USING → 用 service_role 绕过验证
4. select 只查实际用到的字段，× 查未执行 migration 的列
5. × 反复改代码碰运气 → 先定位根因再动手

## 前端协作
- **美学规范权威文件**：`docs/美学规范.md`（项目内唯一版本）。所有前端改造前必读。
- 分工（2026-05-10 锁定）：
  - 前端改造 → Claude Opus 4.7 直接做
  - 后端（Service / RPC / migration 逻辑层） → 固定委托 Codex（`mcp__codex__codex`）
  - SQL migration 执行 → Claude 直接跑（Supabase service_role 连接）
  - Gemini → 仅用于出方案和思路，× 执行改造

## 日志规则
- 每次完成一个任务/修复/功能后，追加记录到 `~/.claude/memory/日志/YYYY-MM-DD.md`
- 格式：`- [HH:MM] 简述做了什么（一行，关键改动+结果）`
- 当天文件不存在就新建，已存在就追加
- 遇到坑/踩雷也记一条，方便复盘
- 这是硬规则，不能省略

## Skill 优先
- 执行任何任务前，强制对照可用 skill 列表匹配最佳 skill；匹配成功必须先调用 skill 再行动，未匹配或不确定时暂停询问，禁止绕过 skill 直接编码。

## 关键规则
- git config user.email = 1305085564@qq.com（Vercel Hobby 要求）
- git remote：git@github.com:1305085564-hue/dydata.git
- 服务端接口用 SUPABASE_SERVICE_ROLE_KEY，× 用 anon key
- cron 接口兼容 CRON_SECRET ?? REMIND_SECRET
- 中文组件名内部用英文 PascalCase，导出时再用中文别名
- 表单切换用 key 重建组件，× 用 useEffect 同步 props

## 踩坑记录
- **组件 API 误用**：使用项目封装的 UI 组件（如 Dialog）前，必须点进源码查看 Props 定义，本项目 DialogTrigger 接收 `render={...}` 透传，而不是标准的 Radix `asChild`。
- **UI 联动遗漏**：实现交互联动（如 Focus 高亮）时，必须覆盖组件的所有渲染形态。如果组件处于折叠态或空状态，外层的占位按钮同样需要响应高亮逻辑。
- **重构机械复制**：在将相邻的表单字段解耦成不同 DOM 时，极易机械复制 `data-missing` 或错误文本验证逻辑（例如将 `videoTitle` 的校验条件误绑给非必填的 `videoUrl`）。提取时需逐行确认字段专属条件。
