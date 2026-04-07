# DYData 项目规则

## 基本信息
- 名称：抖音数据日报平台
- 域名：dydata.cc / dydata.vercel.app
- Supabase：mkkvnogkqcupvxmnoefy.supabase.co（印度孟买区）
- 技术栈：Next.js App Router + Tailwind CSS + shadcn/ui + Supabase + Vercel + Cloudflare

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

## 日志规则
- 每次完成一个任务/修复/功能后，追加记录到 `~/.claude/memory/日志/YYYY-MM-DD.md`
- 格式：`- [HH:MM] 简述做了什么（一行，关键改动+结果）`
- 当天文件不存在就新建，已存在就追加
- 遇到坑/踩雷也记一条，方便复盘
- 这是硬规则，不能省略

## 关键规则
- git config user.email = 1305085564@qq.com（Vercel Hobby 要求）
- git remote：git@github.com:1305085564-hue/dydata.git
- 服务端接口用 SUPABASE_SERVICE_ROLE_KEY，× 用 anon key
- cron 接口兼容 CRON_SECRET ?? REMIND_SECRET
- 中文组件名内部用英文 PascalCase，导出时再用中文别名
- 表单切换用 key 重建组件，× 用 useEffect 同步 props

## OpenClaw / API 10 备忘
- OpenClaw 的 API 10 = 官网订阅线，当前正确模型标识是 `openai-codex/gpt-5.4`
- × 把 API 10 误判成 `api1/gpt-5.4`；两者名字一样但渠道完全不同
- × 在 `~/.openclaw/openclaw.json` 里新增 `openai-codex-oauth.authProfile` 这种自定义结构；当前版本会直接 config invalid
- API 10 正确 provider 形态：`provider=openai-codex`、`api=openai-codex-responses`、`baseUrl=https://chatgpt.com/backend-api`
- OAuth 凭证不写在 provider 里，走 `~/.openclaw/agents/main/agent/auth-profiles.json`
- API 10 不走中转站，依赖本机代理直连官方；如果报 `fetch failed` / `network connection error`，先查代理，不要先怀疑 api1
- macOS LaunchAgent 需要显式带：
- `HTTP_PROXY=http://127.0.0.1:7890`
- `HTTPS_PROXY=http://127.0.0.1:7890`
- `ALL_PROXY=http://127.0.0.1:7890`
- `NO_PROXY=localhost,127.0.0.1,::1`
- `NODE_USE_ENV_PROXY=1`
- 只看默认模型不够，旧会话可能保留 `providerOverride`；判断是否真的切过去，要看“新开会话 + gateway 日志 + models status”
