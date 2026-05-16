# AI 管理助手（/admin/ai-assistant）优化执行方案

> 生成时间：2026-05-08
> 执行代理：Claude Opus 4.7
> 验收：阿禅 + CC

---

## 背景

- AI 管理助手刚经历一轮视觉统一（对齐阿禅美学标准 V1），与 `/content-tools/rewrite` 工作台视觉完全一致
- 业务层在 2026-04-09 已按《第四批 A 对话窗口优化设计》由 Codex 落地：`answer + details` 分层、三类任务区分、内部字段隐藏、调试折叠区仅 owner 可见
- 剩余三处业务细节未到位，这一轮补齐

## 不做的事（硬边界）

1. × 不扩白名单工具
2. × 不改 migration / 数据库 schema
3. × 不改权限模型
4. × 不碰创作者 AI 功能区（/growth、文案拆解、复盘诊断）
5. × 不改 `.env`
6. × 不动视觉层（阿禅美学标准已 100% 对齐，改了就是越界）
7. × 不改 `/content-tools/rewrite`（上一轮已完成）

## 要改的 3 组文件（全部集中在 presentation 层）

### Group A — 高危工具确认卡文案个性化

**改动文件**：
- `src/lib/admin-ai/presentation.ts`（主要）
- `src/lib/admin-ai/core.ts`（如需扩展 high-risk 工具的 describe 字段）

**改动说明**：

当前 `buildMutationPendingPresentation` 对所有高危工具用同一套「这是高风险操作」文案。要改成按工具个性化。

**7 个高危工具清单**（取自 core.ts 的 high-risk 集合）：

| 工具 key | 个性化文案要点 |
|---------|---------|
| `kickUser` | "踢出后该用户立即失去登录权限，填报数据保留但不再关联活跃账号" |
| `changeUserRole` | "角色变更后，默认权限会按新角色模板重置；如果当前该用户有自定义权限，会被覆盖" |
| `changeUserPermission` | "只改权限不改角色；对应功能入口会立即生效/立即消失" |
| `deleteData` | "删除后无法直接恢复，执行前会自动生成备份 SQL；影响范围 = 命中的记录条数" |
| `batchExempt` | "批量豁免后，对应日期不再计入未填报；只影响指定日期范围" |
| `batchRerunTask` | "重跑会覆盖原有结果；AI 调用会重新消耗额度" |
| `clearCache` | "清缓存范围 = all 时影响全站用户；建议先清具体命中的 key" |

**输出结构**（每条 pending 回复必须有）：
1. `answer`：一句话说清「我将做什么」（不超过 20 字）
2. `details.sections`：至少两段
   - 「为什么要确认」：个性化风险说明（对照上表）
   - 「影响范围」：展开参数、命中对象、时间窗口等
3. `details.nextActions` 可选：告诉用户「确认后自动执行 / 取消返回」

### Group B — 历史记录标题加上下文

**改动文件**：
- `src/lib/admin-ai/presentation.ts`（主要）

**当前问题**：
- `historyTitle` 字段当前是「工具类别 + 固定词」，比如 `未填报查询结果` / `权限配置问题诊断`
- 设计文档要求：自然语言摘要，能一眼知道「谁、什么时候、什么问题」

**改造规则**：

| 类型 | 当前标题 | 改后标题 |
|-----|---------|---------|
| 未填报查询 | 未填报查询结果 | 最近 N 天未填报（M 人） |
| 用户信息 | 用户信息查询 | {userName} 的用户信息 |
| 异常数据 | 异常数据查询 | {dateRange} 异常数据（M 条） |
| 任务状态 | 任务状态查询 | {taskName} 执行状态 |
| 诊断 | 权限配置问题诊断 | {userName} 权限异常诊断 |
| 踢人 | 踢出用户 | 踢出 {userName} |
| 改角色 | 角色变更 | {userName} 角色变更（{from} → {to}） |
| 其他修改类 | {工具中文名} | {工具中文名} · {关键对象名} |

**实现约束**：
- 从 tool params + tool result 里**尽力抽上下文**；抽不到就退化回原有标题（不要为此扩工具返回字段）
- `historyTitle` 最长 24 字；超出截断 + 省略号
- 纯 presentation 层改动，不改工具本身

### Group C — 低风险修改工具成功回复友好化

**改动文件**：
- `src/lib/admin-ai/presentation.ts`（主要）

**当前问题**：
- `buildMutationSuccessPresentation` 是统一兜底，所有低风险修改工具成功后只回「执行成功」
- 管理员看不到做了什么、改了多少、下一步能做什么

**改造要点**：

为以下低风险修改工具补专门的成功 builder：
- `fillMissingData` — 告诉改了哪天的哪条记录
- `rerunTask`（低风险 task） — 告诉任务名 + 预计完成时间
- `updateProfileField`（如有） — 告诉改了哪个字段、从什么到什么

**输出结构**（成功态）：
1. `answer`：自然语言描述，一句话说清「做了什么」
2. `details.sections`（可选）：结果明细表格
3. `details.nextActions`：建议下一步动作（比如「查看完整记录 / 继续下一项」）

## 测试要求

1. `npm run build` 必须通过
2. `src/lib/admin-ai/core.test.ts` 保持通过
3. 新增 `src/lib/admin-ai/presentation.test.ts`（或追加）：
   - 每个高危工具的 pending presentation 都有 `details.sections.length >= 2`
   - `historyTitle` 不再是「{工具名}查询结果」这种纯静态字符串
   - 低风险成功 builder 覆盖 `fillMissingData` / `rerunTask`
4. 手动验收清单（由 CC 在代理完成后过一遍）：
   - 踢人确认卡顶部写着「踢出后该用户立即失去登录权限……」而不是「这是高风险操作」
   - 历史侧栏第一条显示「张三角色变更（member → admin）」而不是「角色变更」
   - 补填数据成功后不再是「执行成功」

## 验收标准

1. 7 个高危工具确认卡各自有个性化文案，对照上表逐条核对
2. 历史侧栏标题平均长度增长（抽查 20 条，至少 80% 带上下文）
3. 低风险修改成功回复有实质内容（不再是「执行成功」这种空话）
4. 视觉层不变（阿禅美学标准已到位）
5. `npm run build` 通过
6. 测试通过

## 回滚方案

- 所有改动集中在 `src/lib/admin-ai/presentation.ts` 和（若扩展）`core.ts`
- 改动前代理先创建分支 `fix/admin-ai-presentation-polish`
- 如验收未通过：`git checkout main` 即回滚
- 不新增 migration → 数据库层零风险
