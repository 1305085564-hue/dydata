# UX 全链路审计 — AI 配置中心（/admin/ai-config）

> ⚠️ 版本备注（2）：本文件是 [Trae] 12:35 的原版审计报告（提交 `cebff9d0`），因主文件 `ux-audit-2026-10-11-ai-config.md` 已被 [CX] 13:44 的补测版（提交 `be4e033b`，含响应式四档/键盘/危险闸门复核与 M7-M9/L5 新增发现）覆盖，故单独拉出留档。两版互补：主文件＝最新最全结论，本文件＝原版第一手记录（含"后退可回退视角"的原实测描述，已被 CX 复验纠正为 M8）。

- 日期：2026-10-11
- 环境：本地 dev（localhost:3000），⚠️ dev 直连生产 Supabase 库 → 全程只读纪律（写操作一律不点）
- Persona：阿禅（公司负责人，非技术，时间紧；来此页＝确认 AI 在跑 / 切模型 / 加渠道 / 排障）
- 模式：严格找茬模式
- 账号：必须用老板真实账号（`manage_system` 仅 `company_owner` 持有，组长 `admin` 角色进此页会被 redirect，[route-permissions L24](file:///Users/mac/Projects/dydata/src/lib/route-permissions.ts#L24) + [company-permissions.test L81](file:///Users/mac/Projects/dydata/src/lib/company-permissions.test.ts#L81) 坐实）
- 与 2026-10-10 partial 审计的关系：本日重点补齐其「未覆盖清单」——算力池双视图、接入渠道两步流、键盘可达性、死代码坐实；业务调度表三列口径（H1）沿用前日实测结论。
- **审计完整度：partial（线程一+线程二浏览器实测完成；tooltip 悬停可读性因预算截断未实测，沿用静态判断）**。截图未落盘（子代理存于临时目录后丢失），实测结论以文字记录为准。

---

## 一、结论先行（评分，拉开差距）

| 维度 | 分 | 一句话 |
|------|----|--------|
| 状态可信度 | **5** | 业务表三列口径打架（前日 H1 未修）＋「撤回删除」整套 UI 是死代码，状态承诺兑现不了 |
| 首屏效率与反馈 | **6** | 刷新按钮仅 7px 图标、反馈弱；登录冷编译等待无进度（前日 H2） |
| 操作可预期性 | **6** | 行内下拉「选择即保存」无确认 vs 弹窗「点保存」两套语义并存（前日 M3） |
| 防错与可恢复 | **6** | 停用 5 秒乐观撤回刷新即丢（前日 M2）；危险闸门依赖预览设计在线（代码坐实） |
| 信息密度与文案 | **7** | 冗余列渠道名串过长；装饰文案无信息量 |
| 无障碍/键盘可达 | **5** | 模型卡片低频操作仅 hover 显露，键盘用户够不着；下拉/列表 a11y 属性部分到位 |
| 视觉与布局 | **8** | 发丝表格、留白克制，桌面 1440 观感在线（响应式仍未实测） |

---

## 二、发现（按严重度）

### 🔴 H1 — 业务功能调度表三列口径混用，字面自相矛盾【前日实测坐实；本日代码复核仍在，但当前数据态下未显性爆发】

同 [2026-10-10 报告](file:///Users/mac/Projects/dydata/docs/archive/ux-audits/ux-audit-2026-10-10-ai-config.md) H1。本日重读 [availability.ts](file:///Users/mac/Projects/dydata/src/lib/ai-config/availability.ts) 确认三列仍各用一套定义：下拉「N 个渠道可用」＝`schedulableChannelCount`（调度口径，L285），冗余列健康度＝`health`（检测口径，L213-221），运行状态「运行中」＝又用 `schedulableChannelCount>0`。**两套数都"对"，但渠道一旦"已启用未检测"（untested），同屏就会出现"可用"与"未就绪"打架**。

本日线程一实测补充：当前生产数据态下（渠道均已检测为健康）三列数字自洽（如「DeepSeek Flash (1 个渠道可用) / 共 1 渠道：1 健康 / 运行中」），矛盾未显性爆发——**这不等于问题已修**：前日实测抓到过「5 个渠道就绪 / 全部未就绪 / 运行中」的同屏矛盾，触发条件（存在未检测渠道）随时可能再现。建议同前日：先定口径再动 UI，untested 态在冗余列显示「待检测」而非与"可用"对立的词，下拉措辞与冗余列口径词对齐。

### 🔴 H2 — 「撤回删除」整套 UI 为死代码，删除承诺不可兑现【本日代码坐实】

**复现路径**：模型视角卡片上，渠道被标记删除后本应出现「撤回删除 (Ns)」倒计时按钮——但该按钮**永远不会渲染**。

**根因（三处死代码，全部 grep 坐实，非推测）**：
- [compute-pool-panel L54](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx#L54)：`const [pendingDeletion] = useState<Set<string>>(new Set())` —— **只取 getter，无 setter 调用**，集合恒为空。
- [compute-pool-panel L780-800](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx#L780)：渲染 `<ModelFamilyCard>` 时**未传 `onUndoDeleteKey`**。
- [model-family-card L333](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-family-card.tsx#L333)：`isPending = pendingDeletionKeys.has(key.id)` 恒 false → [L477 撤回按钮](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-family-card.tsx#L477) 不可达。

连带 L141 的每秒 `setInterval` 刷新倒计时、L179 `pendingDeletionRemaining` 计算全部空转。

**影响**：删除是本页最高危操作。代码里写了一套「延迟删除 + 倒计时撤回」的安全网，实际从未接线——用户（和读代码的人）都以为有撤回保护，其实点删除就是真删。违反 AGENTS.md「禁止伪接」「UI 必须显示准确状态」。

**建议**：二选一——① 把 `pendingDeletion` 接上 setter（删除时加入集合、启动倒计时、到期真删、撤回按钮调 `onUndoDeleteKey` 移出）；② 若产品上不需要延迟删除，则**删干净**整套死代码（pendingDeletion / onUndoDeleteKey / isPending 分支 / setInterval / pendingDeletionRemaining），不要留半成品误导。倾向 ①，与业务表「停用 5 秒撤回」交互对齐。

### 🟠 M1 — 全局默认行下拉未配置时显示空白，无占位文案【本日代码坐实】

[model-family-select](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-family-select.tsx) 全局默认行传 `allowEmptyLabel=""`，未配置模型时 `SelectValue` 渲染**空白**，老板看不出是「没配」还是「加载失败」。建议给占位文案「未配置 · 将按全局顺位兜底」之类（与下方琥珀提示呼应）。

### 🟠 M2 — 模型卡片低频操作（排序/同步/删除）仅 hover 显露，键盘用户不可达【本日代码坐实 + 实测佐证】

[model-family-card L488](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-family-card.tsx#L488)：排序/同步/删除按钮包在 `opacity-0 group-hover:opacity-100` 容器里，**没有** `focus-within` 兜底。键盘 Tab 聚焦不触发 `:hover`，这些操作对键盘用户够不着。

实测佐证：线程二确认卡片常驻按钮（改名/上架/添加渠道）始终可见、可点，hover 才显现的正是低频操作组——即 M2 范围精确为「排序/同步/删除」，常驻操作不受影响。

**同仓反证**：[model-manager-dialog L278](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-manager-dialog.tsx#L278) 的同类 hover-only 删除按钮**已经**带 `group-focus-within:opacity-100 focus-visible:opacity-100`——作者会做键盘可达，模型卡片是漏网，属收口不彻底而非能力缺失。建议照搬该写法补齐卡片容器。

### 🟠 M3 — 高级参数 token/轮数上下限仅前端约束，后端不夹取【本日代码坐实，契约缺口】

[bindings-dialogs](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/bindings-dialogs.tsx) 输入框有 min/max（1200-8000 / 1-50），但 [route.ts L490-491](file:///Users/mac/Projects/dydata/src/app/api/admin/ai-config/route.ts#L490) 用 [priority.ts `toPriority`](file:///Users/mac/Projects/dydata/src/lib/ai-config/priority.ts) 处理 `output_token_limit`/`context_message_limit`，而 `toPriority` **只 `Math.trunc` 截断、不夹取范围**。绕过前端（或前端校验漏网）即可写入越界值。违反 AGENTS.md「前后端对账」「超长/非法输入应拒绝而非静默截断」。建议后端补范围校验并返回字段级错误。

### 🟡 M4 — 接入渠道两步流：浏览器直连上游探测的 CORS 隐患 + 优先级 0 静默变 50【本日代码坐实】

[add-key-dialog `handleProbeAndExplore`](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/add-key-dialog.tsx) 从**浏览器端直接 fetch 上游 `/models`**（带用户 API Key）——多数上游不开 CORS，探测大概率失败走静默 fallback，用户以为「探测成功」实为回退；且把 API Key 暴露给浏览器网络层。建议探测改走服务端代理。另：priority 输入 `Number(e.target.value) || 50`，输 `0`（想表达"最后兜底"）被静默变 50，无提示（同前日 M4）。

### 🟡 M5 — ModelManagerDialog 删除成功 toast 可能与部分失败矛盾【本日代码坐实，待实测】

[model-manager-dialog L100-106](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/model-manager-dialog.tsx#L100)：`handleConfirmDelete` 无条件 `await onDeleteModelPermanent(target)` 后即弹 `feedbackToast.success`，不检查返回值。若内部部分渠道删除失败仍报「已彻底删除」，违反「失败就明确失败」。建议 `onDeleteModelPermanent` 返回结果，失败走 error toast。

### 🟡 M6 — 停用/归档乐观撤回刷新即丢【前日 M2，本日代码复核仍在】

[business-functions-panel L657-668](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/business-functions-panel.tsx#L657)：先弹可撤回 toast，5 秒 `setTimeout` 后才真正 `archiveFeature`。5 秒内刷新/关页 → 请求不发出 → 库里仍启用，但前端已宣称"已停用"。建议确认即写库，撤回＝再发 restore。

### ⚪ L1 — `testAllKeys` 死代码【前日坐实，本日复核仍在】

[use-ai-config L337-364](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/hooks/use-ai-config.ts#L337) 定义但全仓无调用（面板走本地 `handleTestAll`）。建议删除。

### ⚪ L2 — 冗余列渠道名串过长、无截断/计数【前日】

一行平铺 4-5 个渠道全名，窄列折行拥挤。建议「N 可用 · M 故障」聚合 + 悬停看明细（符合阿禅偏好）。

### ⚪ L3 — 底部装饰文案无信息量【前日】

[ai-config-shell L62](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/ai-config-shell.tsx#L62)「算力底座静候调度 · 智能容灾与高可用」纯氛围。polish 级，可留。

### ⚪ L4 — `fallbackNonce` 高亮滚动逻辑永不触发【本日代码坐实】

[ai-config-shell L12](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/ai-config-shell.tsx#L12) `const [fallbackNonce] = useState(0)` 无 setter，恒 0；[business-functions-panel L237](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/business-functions-panel.tsx#L237) `if (fallbackNonce <= 0) return` 直接短路。设计中的「兜底时高亮滚动到该业务行」功能从未生效。建议接线或删。

---

## 三、实测通过项（线程一+线程二浏览器实测，对照非表扬）

- **业务调度表读数（线程一实测 PASS）**：当前数据态下三列数字自洽；8 个未配置行正确显示「跟随全局默认兜底 / 运行中」，兜底逻辑的用户表达清晰。
- **高级参数弹窗（线程一实测 PASS）**：「截图识别」行齿轮弹窗字段齐全（OCR 双通道选择卡/模型下拉/最大输出 Token/上下文轮数）；**Escape 关闭干净，父级状态不受影响**（前日担心的 Escape 连带问题不存在）。
- **调度模型下拉展开（线程一实测 PASS）**：选项均标注可用渠道数，当前选中项有 selected 标记；本轮数据态下无 0 渠道选项（前日实测确认 0 渠道项会禁用置灰）。
- **双视图切换（线程二实测 PASS）**：模型视角 ↔ 渠道视角切换，URL 正确带 `?view=model` / `?view=channel`；**浏览器后退键可回退视角**；切换过程无整页闪烁/重新骨架屏；**F5 刷新后视角保持**（?view=channel 不丢）。前日担心的"状态丢失"不存在。
- **首屏加载（两线程实测 PASS）**：登录进页无长时间骨架屏、无明显闪烁，F5 后内容直接可见（dev 环境，前日 H2 登录 30 秒等待本轮未复现，推测前日为冷编译，生产无此问题——维持"待线上复核"结论）。
- **接入渠道弹窗第一步（线程二实测 PASS）**：字段齐全（所属接入点/渠道显示名/API Key/调度顺位），取消关闭干净，无残留。
- **网络（两线程实测 PASS）**：全程仅 GET，`GET /api/admin/ai-config` 多次 200，无 4xx/5xx、无意外 POST——只读纪律执行到位。
- **控制台（两线程实测 PASS，纠正前日归因）**：线程二见 1 条 hydration 警告，差异属性为 `data-trae-ref`——**这是 Trae 浏览器自动化插件注入的调试属性，不是页面代码缺陷**；线程一同工具通道下 console 为空。前日报告将其列为"Medium 隐患"属误诊，本日撤销；除此之外无 JS 错误。
- 危险闸门 [dangerous-action-dialog](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/dangerous-action-dialog.tsx)：核查不完整时禁用确认按钮、强制给「更窄替代操作」、critical 依赖提示后端 409 拦截——防错设计在线（代码坐实）。
- 健康度四态文案真源统一 [presentation.ts `HEALTH_PRESENTATION`](file:///Users/mac/Projects/dydata/src/lib/ai-config/presentation.ts)（健康/待命中/故障/已停用），避免同屏两本账——但注意这与 H1 冗余列「就绪/未就绪」用词**仍不一致**，是 H1 的旁证。
- 可用性计算 [availability.ts](file:///Users/mac/Projects/dydata/src/lib/ai-config/availability.ts) 口径与运行时 `resolveFeatureChannelChain`/`toConfig` 显式对齐（注释声明），逻辑严谨。
- SyncModelsDialog 幽灵模型比对四态（unknown/确认失效/疑似未验证/全部核实）呈现克制、不臆测数字（[L538-646](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx#L538)），符合「杜绝假数字」。
- 渠道模型检测有「正在检测 N 个…」role=status 实时态 + 超时「继续检测」action，反馈完整。

---

## 四、覆盖统计

- 静态元素清单：≈ 45+ 交互元素（2 面板 + 8 弹窗 + 表格行操作 + 双视图切换）。
- 静态代码审查：**100% 覆盖**（15 组件 + 2 hooks + availability/presentation/priority 计算层 + route 校验）。
- 浏览器实测（线程二，8/8 PASS）：首屏加载、双视图切换与 URL/后退/刷新保持、模型视角卡片（常驻按钮 vs hover 显露按钮区分）、渠道视角分组、接入渠道弹窗第一步（取消路径）、console/network、F5 复测。
- 浏览器实测（线程一，业务调度表）：重试中（前日已实测过 P0 三列读数，本轮补 tooltip 悬停、齿轮弹窗字段、下拉展开态）。
- 未覆盖：响应式 4 档（浏览器 resize 受安全策略限制）、键盘-only 完整遍历、危险闸门依赖预览 loading、各写操作执行流（生产写保护主动不点）。

---

## 五、修复优先级建议

1. **H2 撤回删除死代码**——要么接线要么删净，别留假安全网（高危操作的可信度）。
2. **H1 三列口径统一**——直击主任务可信度（前日已列，今日确认未修，应尽快收口）。
3. **M3 后端补范围校验**——契约缺口，越界值可入库。
4. **M2 键盘可达**——focus 显露操作按钮。
5. M1/M4/M5/M6——状态可信与防错，逐个收口。
6. L1-L4 死代码清理——顺手还债。

> 补测建议：本日为 partial。线程一业务表读数、响应式、危险闸门 loading 请在浏览器桥接恢复后或预发环境补跑，结论以实测为准。
