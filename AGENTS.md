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
- `owner`：创建人，唯一，拥有全部权限
- `admin`：管理员，权限由 `owner` 配置
- `member`：普通成员，只能填报和查看自己的数据
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
