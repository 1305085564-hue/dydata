# DYData 项目记忆

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
- Migration 执行状态：001-006 已执行，007 待执行（owner角色+permissions字段）

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
- FEISHU_WEBHOOK_URL
- CRON_SECRET
- AI_BASE_URL=https://www.aiapikey.net
- AI_API_KEY=sk-luu389f...（api7）
- AI_MODEL=claude-sonnet-4-6

## 外部服务
- Cloudflare NS：aron/hal.ns.cloudflare.com
- 飞书 webhook：已配置到环境变量
- 首个管理员：1305085574@qq.com

## 当前状态（2026-03-16）
- P1-P4 全部完成，build 零错误
- P5 权限体系完成（owner/admin/member + 细粒度权限 + checkbox UI）
- 待执行：migration 007 SQL + 配置 AI 环境变量 + git push 部署

## 待做
- [ ] Supabase 执行 migration 007（owner角色+permissions字段）
- [ ] UPDATE profiles SET role='owner' WHERE name='阿禅';
- [ ] 配置 AI_BASE_URL / AI_API_KEY / AI_MODEL 环境变量
- [ ] git push 触发 Vercel 部署
- [ ] 管理员首批 4-5 人开通 + cron job + 飞书测试
- [ ] 后续迭代：内容标签体系、发布时间自动解析、analytics 结论优先

## 关键踩坑
| 问题 | 根因 | 修复 |
|------|------|------|
| 邀请码查不到 | anon key 不完整 + RLS | 补全 key + validate_invite_code() SECURITY DEFINER |
| profile 未创建 | 邮箱确认开启导致 session 为空 | 关闭邮箱确认 + 调整注册顺序 |
| submitter 为空 | 表单未传字段 | 从 profiles 自动查姓名 |
| 国内打不开 | Vercel 被墙 | Cloudflare DNS 代理 |
| 异常检测误报 | 数据不足 | ≥3 天数据才标记 |
