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
