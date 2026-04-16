# DYData

抖音数据日报平台。

正式环境：
- 站点：[dydata.cc](https://dydata.cc)
- 备用域名：[dydata.vercel.app](https://dydata.vercel.app)
- 部署平台：Vercel
- 数据库：Supabase

代码仓库：
- `git@github.com:1305085564-hue/dydata.git`

## 技术栈

- Next.js App Router
- React 19
- Tailwind CSS
- shadcn/ui
- Supabase
- Vercel

## 核心模块

- `/dashboard`：员工日报提交
- `/growth`：成长分析
- `/analytics`：数据分析
- `/admin`：管理后台
- `/admin/analytics`：经营分析
- `/api/remind`：日报提醒
- `/api/video-submit`：截图识别后的上传链路

## 本地启动

先安装依赖：

```bash
npm install
```

再启动开发环境：

```bash
npm run dev
```

默认地址：

```bash
http://localhost:3000
```

## 必要环境变量

本项目至少需要这些环境变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FEISHU_WEBHOOK_URL=
CRON_SECRET=
REMIND_SECRET=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

当前约定：

- `AI_BASE_URL=https://www.aiapikey.net`
- `AI_MODEL=claude-sonnet-4-6`

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run import:reports -- <文件路径>
```

## 数据与部署

- 线上部署以 Vercel 为准
- `main` 分支 push 后自动部署
- Supabase 项目：`mkkvnogkqcupvxmnoefy`
- 数据库变更只允许新增 migration，不能改旧 migration

## 维护禁区

- 不要把部署链路切到 Cloudflare Workers
- 不要改 `.env` 线上值
- 不要改 `supabase/migrations/` 里的旧文件
- 不要随便改 `package.json scripts`、`next.config.*`、`tsconfig.*`
- 不确定时先查 [CLAUDE.md](./CLAUDE.md)

## 交接建议

如果要把项目交给别人维护，至少要一起交：

- GitHub 仓库权限
- Vercel 项目权限
- Supabase 项目权限
- 域名 / Cloudflare 权限
- 飞书 webhook 和 AI key 的保管方式

详细清单见：

- [项目交接说明.md](./项目交接说明.md)
- [docs/维护交接清单.md](./docs/维护交接清单.md)
- [docs/数据口径.md](./docs/数据口径.md)
- [CLAUDE.md](./CLAUDE.md)
