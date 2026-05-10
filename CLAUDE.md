# DYData 项目规则

## 基本信息
- 名称：抖音数据日报平台
- 域名：dydata.cc / dydata.vercel.app
- Supabase：mkkvnogkqcupvxmnoefy.supabase.co（印度孟买区）
- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel
- 部署平台：Vercel（push main 自动部署），× Cloudflare Workers
- 域名 DNS 在 Cloudflare，但部署 × 走 Cloudflare Workers

## 角色权限
- owner：创始人，唯一，所有权限
- admin：管理员，权限由 owner 配置（profiles.permissions jsonb，7 个 key）
- member：普通成员，只能填报和查看自己数据
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
| /admin | 管理后台（豁免+权限+踢人） | admin/owner |
| /admin/analytics | 经营分析（趋势+爆款+AI洞察） | admin/owner |

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
- **美学法典权威文件**：`~/.claude/memory/阿禅美学标准-V1.2.md`（全局，唯一版本）。所有前端改造前必读。项目 docs/ 不再维护副本，避免版本漂移。V1/V1.1/V2 均已废止。
- 多批次前端改动默认走 Gemini + Codex 联动：Gemini 先出分批方案 → 我把关纠偏 → Gemini 按确认方案执行 → Codex 审代码 → 再决定补问题还是进下一轮
- 标准文档：`docs/前端-Gemini-Codex联动流程.md`

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
