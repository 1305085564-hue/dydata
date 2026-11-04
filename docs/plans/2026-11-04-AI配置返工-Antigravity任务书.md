# AI 配置返工 · Antigravity 任务书（2026-11-04 验收发现）

> 来源：CC 对分支 `codex/ai-availability-governance`（dd3a66dd）的独立验收。四项发现，两项属你（展示），一项小文案，一项依赖 Codex 前置任务书（见文末）。

## 执行纪律

- 不理解需求先问；不优化、不加创意、不改后端规则。
- 照抄本规格：UI 按视觉规格执行，逻辑按数据契约接入。
- 只能补类型、调命名、写注释。
- 交付前逐条对照验收清单自查，自查结果附在交付说明里。

## 文件清单

| 操作 | 文件 |
|---|---|
| 改 | `src/app/(app)/admin/ai-config/components/channel-pool-view.tsx` |
| 改 | `src/app/(app)/admin/ai-config/components/model-test-feedback.tsx` |
| 改 | `src/app/(app)/admin/ai-config/components/model-family-card.tsx`（仅任务 D，且需 Codex 前置完成） |
| 改 | `src/lib/ai-config/presentation.ts`（新增休眠倒计时格式函数，供两个视角共用） |
| 禁碰 | `src/lib/ai/channel-governance.ts`、`src/lib/ai-config/availability.ts`、`src/app/api/admin/ai-config/route.ts`、任何迁移文件 |

## 数据契约（唯一来源，不得在前端重写判断）

`bundle.availability.keys[]` 按 `keyId` 提供：`identity`（active/retest/sleeping/invalid/disabled）、`sleepSource`（manual/automatic/null）、`sleepUntil`、`persistentFailure`、`isSchedulable`。
`bundle.availability.modelFamilies[].channels[]` 按 `keyModelId` 提供同构字段加 `sortOrder`。
五态文案与颜色沿用 `model-family-card.tsx` 现有映射，不得另起一套。

## 任务 A：渠道视角接入五态（中级，验收发现①）

现状：`channel-pool-view.tsx` 列表行（约 L247）与详情面板（约 L106、L370-377）仍用 `getProviderKeyHealthStatus` 四态（健康/待命中/故障/已停用）。

规格：
1. 删除 `getProviderKeyHealthStatus` 与 `HEALTH_PRESENTATION` 在本文件的使用，改为从 `bundle.availability.keys` 按 `keyId` 取 `identity`。
2. 列表行圆点+title、详情面板状态徽章改为五态：
   - active → 正常在岗 `#4B6B4E`
   - retest → 待复测 `#8A6A2F`
   - sleeping → 自动休眠中 / 管理员手动休眠（按 `sleepSource`）`#78716C`，后接 `· 剩余 X 分钟`
   - invalid → 已失效；`persistentFailure` 为真时 → 持续不可用（连续失败超24小时）`status-danger`
   - disabled → 已停用 `#A8A29E`
3. `availability` 缺失（旧缓存）时降级显示「状态未知」灰色，不得回退四态判断。
4. 休眠倒计时格式化函数从 `model-family-card.tsx` 的 `formatSleepRemaining` 提取到 `presentation.ts`（命名 `formatSleepCountdown`），两个视角共用；模型卡改为引用它，删除本地副本。

## 任务 B：失败卡片不再显眼展示原始报错（低级，发现③）

现状：`model-test-feedback.tsx` L135-138 在卡片主体直接渲染 `rawMessage`（含 HTTP 503 与上游 JSON），与「主文案人话化」矛盾。

规格：
1. 删除主体中的 `rawMessage` 区块（L135-138）。
2. 主体只保留：图标 + 「本次测试未通过 · {headline}」+ 归属标签 + 按钮组。
3. 原始报错已在折叠区 `techMessage` 中展示，不动。
4. `diagnostic` 缺失时 headline 兜底「渠道测试未通过」，此时主体可显示 `rawMessage`（无更人话的信息可用），有 diagnostic 时绝不显示。

## 任务 C：渠道视角 # 序号语义澄清（低级，发现④）

现状：渠道视角行首 `#{idx+1}` 实为全局兜底序（跨模型），易误读为某模型顺位。

规格：
1. 数字徽章加 `title="全局兜底顺位（跨模型）"`。
2. 列表顶部（「渠道 (10)」标题旁）加一行 12px `#A8A29E` 说明：「此处顺序为全量兜底调用顺位；模型内顺位请在模型视角调整。」
3. 不改列表排序逻辑（仍按 `compareChannelPriority`）。

## 任务 D：模型视角失效/停用收纳（中级，发现②；依赖 Codex 前置）

**前置条件：Codex《交换顺位校验放宽》任务书已合入。未完成前不得开工本任务。**

现状：invalid/disabled 渠道留在主列表原位（仅变灰），交付报告声称的「沉底收纳」未实现。

规格（收纳式，非物理沉底）：
1. 主列表只渲染 `identity ∈ {active, retest, sleeping}` 的渠道，保持 `sortOrder` 顺序与现有 # 序号、上下移行为。
2. `identity ∈ {invalid, disabled}` 的渠道移入卡片底部折叠区：
   - 折叠条文案：`{N} 个不可用渠道（已失效或停用）`，右侧 ChevronDown/Right，默认收起；
   - 展开后每行：label + 原因徽章（已失效 / 持续不可用（连续失败超24小时）/ 已停用）+ 启用开关 + 「测此渠道此模型」按钮；
   - 收纳区行**无**上移/下移按钮；
   - 展开状态为组件本地 state，不持久化。
3. 主列表为空且收纳区非空时，显示现有空态文案 + 收纳区自动展开。
4. `availability` 缺失时不收纳（保持现状全列表），不得用四态字段推断。
5. 测试反馈结果（`modelTestResults`）在收纳区行内同样渲染。

## 验收标准

功能（本地隔离环境 `codex/ai-availability-governance` 分支实测）：
1. 渠道视角 10 行全部显示五态之一，无「健康/待命中/故障」字样残留。
2. 渠道视角休眠行显示剩余分钟；模型视角与渠道视角对同一 Key 的身份文字一致。
3. 触发一次真实失败（api 7 gemin × Gemini 2.5 Flash），卡片主体无 HTTP 状态码与 JSON；展开技术详情可见状态码。
4. 渠道视角 # 徽章 hover 显示全局兜底说明。
5. （任务 D）失效渠道不出现在主列表；折叠条计数正确；展开后开关与测试可用；主列表末条下移与其后第一个可用渠道（跳过失效）互换成功、反向还原成功。
6. 全池概览条、模型卡汇总数字不因本次改动变化（仍来自服务端 availability）。

视觉走查：
7. 五态色点与文案对比模型视角一致；1440px 与 390px 无溢出、无截断。
8. 折叠区展开/收起动画使用现有 transition 规范，不新增依赖。

代码检查：
9. `npx tsc --noEmit` 退出 0；`npm run lint` 0 错误。
10. `channel-pool-view.tsx` 不再 import `getProviderKeyHealthStatus`；`formatSleepRemaining` 全仓仅存 `presentation.ts` 一份实现。

## 参考与约束

- 只读参考：`model-family-card.tsx`（五态映射、休眠行、测试反馈接入方式）、`availability.ts` 类型定义。
- 必须复用：`availability` 数据、`ModelTestFeedback` 组件、现有 Button/Badge/Chevron 组件。
- 禁用：前端自行推导身份；新增状态库；修改调度/统计/接口；为通过验收改后端。
