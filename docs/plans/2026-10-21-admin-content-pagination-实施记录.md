# `/admin/content` 首屏减重与服务端分页实施记录

## 已实现

- 新增 `admin_content_list_page` 只读 RPC。筛选、派生指标、评级、异常分类、选题库状态、统计、排序、稳定 ID 次序和分页在数据库侧执行。
- 新增共享列表查询契约，包含页码、页容量、14 个排序字段、全部现有筛选、游标与查询指纹。
- 首屏和后续页面均通过该 RPC 获取当前页；账号选项与成员选项按当前范围提供。
- 当前页 JSON 只带表格需要的作品字段和最新 24h 指标。文案、作品链接和截图由详情接口按需读取。
- 筛选、排序、视图、范围和页容量变化会回第一页；相邻页使用带查询指纹的游标，空排序值保持 NULLS LAST 和 ID 稳定顺序。游标失效时提示数据已更新并回第一页。
- 保留列表旧 loader 供旧调用方使用。`/admin/content` 当前入口使用 RPC loader。
- 新增 migration 回滚 SQL，仅移除新 RPC。

## 施工前基线与验收状态

| 项目 | 结果 |
|---|---|
| 当前 active / trashed 视频数 | BLOCKED：本地 Supabase 数据库容器不存在，未取得查询结果 |
| 24h 快照总行数与覆盖视频数 | BLOCKED：本地 Supabase 数据库容器不存在，未取得查询结果 |
| 当前列表读取的视频、快照、标签行数 | BLOCKED：无数据库服务，未取得实际请求证据 |
| 当前首屏资源体积与业务响应体积 | BLOCKED：本地 Next build 缺少 `node_modules/next`，未能启动页面 |
| 新接口 pageSize=20 / 100 响应体积 | BLOCKED：RPC 尚未在数据库执行 |
| 10 倍数据体积和耗时对照 | BLOCKED：没有可运行数据库及 10 倍数据集 |
| 组长账号真实角色与浏览器验收 | BLOCKED：页面无法在本地启动，未取得真实账号浏览器证据 |
| usage_events 前后数量对照 | BLOCKED：缺少基线与真实操作会话 |

以上未以静态推算或测试替代真实数据验收。发布前需在可用 Supabase 环境执行 migration 和 rollback 演练，再按需求书完成真实账号浏览器验收。

## 本轮验证

- 定向测试：查询契约、列表 API、详情 API、URL 状态及筛选相关测试通过，共 28 项。
- ESLint：本次触及的应用与 loader 文件通过。
- PostgreSQL SQL formatter：migration 可解析；本机无 Postgres 服务，因此不等价于数据库执行验证。
- `git diff --check`：通过。
- 全量测试：2,291 通过、8 跳过、1 失败。失败为未修改的 `src/lib/cross-team-security.test.ts` 调用已变化的截图依赖，运行时报 `dependencies.readScreenshot is not a function`。
- TypeScript：仅剩上述未修改测试的两处 `createSignedUrl` 类型错误。
- Next build：BLOCKED，Next 报告无法解析 worktree 内 `next/package.json`。

## 第二轮修复（2026-10-21 下午）：上一轮真实浏览器验收的 6 个缺陷

第一轮真实验收（生产构建 + 生产库 + 组长账号）通过后仍留了 6 个问题，本轮逐条修完并复验。

| # | 缺陷 | 处理 | 复验结果 |
|---|---|---|---|
| 1 | 点「下一页」必然 409 `staleCursor`，弹回第一页且无提示 | 游标指纹改为绑定「权限解析后的团队范围」，不再用 URL 里可缺省的 `teamId` | 200，`page=2`，20 行，首行变化 |
| 2 | 详情没有「上一条 / 下一条」 | 补回相邻浏览，位置按全局分页序号计算，到页边界自动取相邻页 | 按钮存在，点下一条 ID 从 `fdb6f087` 变 `a3afdbe5` |
| 3 | 详情加载失败静默 | 失败显示明确文案（列表摘要不冒充详情）+ 重试 / 返回列表 | 注入 500 后显示文案，详情不打开 |
| 4 | 高亮规则序列化成 `[object Object]` | 统一走 `writeContentListFilters`，输出 `hl=playCount:1000:5000` | URL 无可分享性问题，`hl` 编码正确 |
| 5 | `topicStatus` 深链显示空状态 | 服务端分页后客户端不再二次按缺失状态筛空 | 20 行，无空状态 |
| 6 | 列表接口失败无可见提示 | 失败提示「列表没能刷新，当前显示的仍是上次的数据」 | 注入 500 后提示出现 |

跨页相邻浏览：第 1 页最后一条点「下一条」→ 请求第 2 页 → 打开该页首条，抽屉保持打开。

### 第二轮验证

- 真实浏览器复验脚本：`output/acceptance/admin-content-pagination-v4.mjs`（生产构建 + 生产库只读 + 组长账号 + `localhost` 域）。
- 结果：12 项断言 12 通过 0 失败；控制台 error 仅 2 条，均为本轮故意注入的 500。
- 证据：`docs/reference/2026-10-21-admin-content-真实数据库验收/round2/`（8 张截图 + `round2-acceptance.json`）。
- 定向测试 89 项通过；ESLint 本次改动范围 0 问题（修掉了 effect 内同步 setState 的级联渲染告警）。
- 全量测试 2,299 通过 / 8 跳过 / 1 失败，失败仍是未修改的 `cross-team-security.test.ts`（截图依赖重构遗留，非本分支引入）。
- 构建：`next build --webpack` 通过。worktree 的 `node_modules` 是指向主仓的软链，Turbopack 会报 "symlink points out of the filesystem root"，只能用 webpack 构建。

### 仍未解除的阻塞

- **10 倍数据验收 BLOCKED**：本机没有可写的隔离 Supabase，生产库不允许灌测试数据。解除条件：给一个隔离项目 + 复制脚本，或明确授权在隔离项目里造 10 倍数据集。
