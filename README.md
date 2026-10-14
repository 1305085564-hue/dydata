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

总入口看 `docs/DYData产品全书.md`（场景 → 文件的映射表）。长期事实分三类：

- `docs/业务逻辑/` — 权限与访问控制、数据口径与计算规则、核心业务流程、异常与边界处理
- `docs/系统架构与设计/` — 全站模块地图、工程运行事实、核心数据表关系、全站命名对照表、Claude设计哲学与设计规范，外加 7 份工程规范（数据库查询、错误处理编码、缓存策略、外部调用与重试、全局耦合点使用、数据库发布与恢复、运行观测与告警）
- `docs/通用管理/` — 待办清单、上下文交接、文档维护入口、纠错索引、可维护性维护入口、CLAUDE.md写作指南

其他：

- `docs/reference/` — 带日期的验收与留档报告，以及单功能接口契约（协作管理、选题库、视频复盘等）
- `docs/reference/架构与性能双层门禁设计-2026-08-30.md` — 本轮门禁方案与验收记录
- `docs/archive/性能优化历史-截至2026-08-30.md` — 性能优化历史实测记录（仅按需追溯）

## 开发纪律（摘要）

- 页面首屏原则上由对应的 `src/lib/loaders/` 协调；加载分层、性能预算和证据边界见 `docs/系统架构与设计/工程运行事实.md`。
- 数据库结构变更只能新增 migration；接口新字段上线需过「migration → 刷新 schema cache → 真实角色验收」三步。
- 成员当前操作用 `activeVisibleUserIds`，历史查询用 `visibleUserIds`（统一复用 `src/lib/data-access-scope.ts`）。
- 提交只精确 add 自己改过的文件，禁止 `git add .`；push `main` 需项目负责人确认。
