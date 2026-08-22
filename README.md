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
| `src/app/(app)/` | 登录后页面（dashboard、growth、admin/* 等） |
| `src/app/api/` | 接口路由 |
| `src/lib/loaders/` | 页面首屏数据加载器（一个页面一个 loader） |
| `src/lib/ai/`、`src/lib/admin-ai/` | AI 客户端与功能配置 |
| `src/components/` | 可复用 UI 组件（基础组件在 `components/ui/`） |
| `supabase/migrations/` | 数据库 migration（只增不改） |
| `docs/` | 项目文档（见下） |

## 文档导航（权威入口）

- `docs/全站模块地图.md` — 模块组成、依赖连累关系、性能红线与缓存清单
- `docs/代码治理手册.md` — 目录职责、命名、发布纪律
- `docs/权限与安全说明.md` — 权限模型、RLS、service role 约束
- `docs/数据口径.md` — 指标口径
- `docs/reference/项目事实.md` — 产品事实、环境变量、技术栈权威记录
- `docs/plans/_跨模块/性能优化台账.md` — 性能优化历史实测记录

## 开发纪律（摘要）

- 页面首屏数据统一走 `src/lib/loaders/`，loader 内独立查询必须并行。
- 数据库结构变更只能新增 migration；接口新字段上线需过「migration → 刷新 schema cache → 真实角色验收」三步。
- 成员当前操作用 `activeVisibleUserIds`，历史查询用 `visibleUserIds`（统一复用 `src/lib/data-access-scope.ts`）。
- 提交只精确 add 自己改过的文件，禁止 `git add .`；push `main` 需项目负责人确认。
