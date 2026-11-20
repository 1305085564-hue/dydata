# DYData 抖音数据日报平台

内部团队数据管理工具：员工提交每日作品数据日报，管理端做视频复盘、履约管理、协作统计和 AI 辅助分析。

## 技术栈

- Next.js（App Router）+ TypeScript + Tailwind CSS + shadcn/ui
- 数据库：Supabase（Postgres，含 RLS）
- 部署：Vercel（唯一正式部署平台），`main` push 自动上线
- 仓库中的 OpenNext/Cloudflare 配置为历史残留，不是部署入口

## 常用命令

```bash
npm run dev        # 本地开发
npm test           # 单元测试（node:test）
npx tsc --noEmit   # 类型检查
npm run build      # 生产构建
npm run lint       # ESLint
npm run analyze    # 带 bundle 分析的生产构建
DYDATA_PERF_LOG=1 npm run dev   # 输出 [perf] 加载器耗时日志
```

## 目录速览

| 路径 | 内容 |
|---|---|
| `src/app/(app)/` | 登录后页面（dashboard、topics、admin/* 等） |
| `src/app/api/` | 接口路由 |
| `src/lib/loaders/` | 页面首屏数据加载器 |
| `src/lib/ai/`、`src/lib/admin-ai/` | AI 客户端与功能配置 |
| `src/components/` | 可复用 UI 组件（基础组件在 `components/ui/`） |
| `supabase/migrations/` | 数据库 migration（只增不改） |
| `docs/` | 项目文档（见下） |

## 文档导航（权威入口）

总入口看 `docs/reference/DYData产品全书.md`（场景 → 文件的映射表）。长期依据都在 `docs/reference/`：

- [设计与决策](docs/reference/设计与决策.md) — 总目录兼全站模块地图，下分三个文件夹：页面设计与决策（每页一份）、链路设计与决策（跨页面的业务链路）、全站设计与决策（工程底座、上线与运维，以及后端工程规范、效率美学、美学宝典、文档与维护规范、CLAUDE.md写作指南、纠错索引）
- `docs/reference/` 根目录其余文件 — 已确认的接口契约和按日期命名的验收、核对记录

其他：

- `docs/通用管理/` — 待办清单、上下文交接
- `docs/plans/` — 待做与在办。
- `docs/archive/性能优化历史-截至2026-08-30.md` — 性能优化历史实测记录（仅按需追溯）

## 开发纪律（摘要）

- 页面首屏原则上由对应的 `src/lib/loaders/` 协调；加载分层、性能预算和证据边界见 `docs/reference/全站设计与决策/工程底座.md`「性能预算与加载」，后端写法硬规矩见 `docs/reference/全站设计与决策/后端工程规范.md`。
- 数据库变更和发布顺序见[项目规则](AGENTS.md)与[后端工程规范](docs/reference/全站设计与决策/后端工程规范.md)。
- 成员当前操作用 `activeVisibleUserIds`，历史查询用 `visibleUserIds`（统一复用 `src/lib/data-access-scope.ts`）。
- 提交只精确 add 自己改过的文件，禁止 `git add .`；push `main` 需项目负责人确认。
