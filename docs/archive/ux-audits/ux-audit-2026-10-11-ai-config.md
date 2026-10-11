# UX 全链路审计 — AI 配置中心（/admin/ai-config）

- 日期：2026-10-11
- 环境：本地 dev（localhost:3000），⚠️ dev 直连生产 Supabase 库 → 全程只读纪律（写操作一律不点）
- Persona：阿禅（公司负责人，非技术，时间紧；来此页＝确认 AI 在跑 / 切模型 / 加渠道 / 排障）
- 模式：严格找茬模式
- 账号：必须用老板真实账号（`manage_system` 仅 `company_owner` 持有，组长 `admin` 角色进此页会被 redirect，[route-permissions L24](file:///Users/mac/Projects/dydata/src/lib/route-permissions.ts#L24) + [company-permissions.test L81](file:///Users/mac/Projects/dydata/src/lib/company-permissions.test.ts#L81) 坐实）
- 与 2026-10-10 partial 审计的关系：本日重点补齐其「未覆盖清单」——算力池双视图、接入渠道两步流、键盘可达性、死代码坐实；业务调度表三列口径（H1）沿用前日实测结论。
- **审计完整度：partial（本轮补做真实 Chrome owner/leader 角色、375/768/1024/1280/1440 响应式、键盘弹窗、表单中断与危险闸门复核；写操作、tooltip 悬停可读性及生产 owner 页面仍未执行）**。本轮截图通过 CUA inline capture 查看，未落盘；实测结论以文字记录为准。

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
| 视觉与布局 | **7** | 发丝表格、留白克制，桌面 1440 观感在线；移动端核心调度列藏在无提示横向表格内 |

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
- **双视图切换（本轮部分 PASS，纠正前次结论）**：模型视角 ↔ 渠道视角切换，URL 正确带 `?view=model` / `?view=channel`；切换过程无整页闪烁/重新骨架屏；**F5 刷新后视角保持**（?view=channel 不丢）。但本轮实际走「模型 → 渠道 → 模型 → 浏览器后退」，后退直接离开 AI 配置页回到 `/dashboard`，不能回退到上一个视角；原因是 [compute-pool-panel L101-107](file:///Users/mac/Projects/dydata/src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx#L101) 用 `history.replaceState` 替换当前历史，不会新增历史项。前次“后退键可回退视角”判定作废，详见本轮补充。
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
- 浏览器实测（前两线程＋本轮）：首屏加载、模型/渠道切换、刷新保持、模型卡片常驻/hover 操作区、渠道分组、接入渠道两步流、表单中断、375/768/1024/1280/1440 视口、键盘弹窗、危险闸门预览、console/network、线上 leader 权限边界。
- 浏览器实测纠正：URL 切换正确，但浏览器后退不会回到上一个视角，而是离开到 `/dashboard`；本轮已按 M8 登记。
- 未覆盖：生产 owner 真实写入后回读、完整 tooltip 悬停、同步/检测/停用/删除执行结果、真实密钥探测与线上部署 SHA 对应页面行为。

---

## 五、修复优先级建议（已并入本轮复验新增 M7-M9/L5）

1. **H2 撤回删除死代码**——要么接线要么删净，别留假安全网（高危操作的可信度）。
2. **H1 三列口径统一**——直击主任务可信度（前日已列，今日确认未修，应尽快收口）。
3. **M3 后端补范围校验**——契约缺口，越界值可入库。
4. **M2 键盘可达 / M8 视角后退语义**——同属"导航与可达"类：focus 显露操作按钮；视角切换改用 push 或明示不可回退。
5. **M7 移动端核心列隐藏**——375px 下模型/健康/操作列无提示横滑才可见；若老板不用手机管后台可降级，但"无提示"本身是信任问题。
6. M1/M4/M5/M6/M9——状态可信与防错，逐个收口（M9 接入草稿离开丢失建议与 M4 两步流改造一起做）。
7. L1-L5 死代码与隐藏入口清理——顺手还债（L5 模型管理弹窗入口二选一：补正常入口或删面板）。

> 补测建议：本日为 partial。生产 owner 页面、真实写入后回读、tooltip 悬停可读性和所有检测/同步执行流仍需在明确授权及安全环境中补跑，结论以实测为准。

---

## 六、本轮复验补充（2026-10-11 当前会话）

### 新增问题

### 🟠 M7 — 375px 下核心调度列藏在无提示的横向表格里【真实浏览器实测】

在本地 owner 账号、`375×812` 视口下，业务调度表外层容器宽 `332px`、内部表格宽约 `977px`，`overflow-x: auto`；首屏只能看到「业务功能」「定位与说明」，「调度模型系列」「渠道冗余与健康度」「运行状态」「操作」全部在右侧。页面没有出现「左右滑动查看」等提示，也没有可见滚动条。

这不是页面整体溢出（页面 `scrollWidth=clientWidth=360px`），而是核心配置被藏在不可见的横向内容里：手机用户看不到当前模型、健康状态，也不知道还存在可操作列。`768px`、`1024px` 仍有同一张表的横向超宽（内部约 `977px`），桌面 `1280/1440px` 未见页面级横向溢出。

建议移动端改为每行纵向信息块，或至少给出明确横向查看提示并优先露出「模型/状态」；不要只依赖触摸用户自行猜到可以横滑。

### 🟠 M8 — 视角切换破坏浏览器后退语义【真实浏览器复现 + 代码根因】

复现：打开模型视角 → 点「渠道视角」→ 点回「模型视角」→ 按浏览器后退。实际回到 `/dashboard`，而不是回到渠道视角。URL 在切换时确实变化，但 `replaceState` 没有产生可回退的历史节点。

影响是用户在两个视角之间比较时，按后退会意外离开配置页；再次进入还要重新定位。建议使用 Next 路由的 push 语义或显式维护视角历史；若产品明确不希望视角进入历史，也应避免把“可变 URL”做成看似可回退的状态。

### 🟡 M9 — 接入渠道填写到一半离开页面会静默丢失【真实浏览器复现，未输入密钥】

在「接入渠道」弹窗填写无敏感信息的渠道显示名 `UX Audit Draft` 后导航到工作台，再返回 AI 配置页，弹窗已关闭、草稿不存在，页面没有离开确认或恢复提示。空提交时渠道名/API Key 的校验能正确阻止请求，且本轮未输入真实 API Key、未产生 POST；问题只发生在用户已经填写内容后主动离开。

对公司所有者来说，重新填写渠道名、上游地址和密钥的成本较高。建议在弹窗有非空内容时，关闭、切页或浏览器离开前提示「未完成的接入配置将丢失」；密钥不落本地，只需提供确认，不要做敏感信息持久化。

### ⚪ L5 —「模型管理与上下架」弹窗没有正常入口【静态 + DOM 实测】

模型视角 DOM 中没有「模型管理与上下架」的可见按钮或可发现入口。源码中 `setModelManagerOpen(true)` 唯一调用位于彻底删除模型确认框的「保持为储备状态（无需删除）」替代动作之后；普通用户必须先发起高风险删除，再选择替代动作，才能进入这个管理面板。当前卡片虽有单模型上下架开关，基础能力未完全丢失，但弹窗提供的搜索、状态筛选与集中查看能力属于隐藏能力。

建议为该面板提供正常的「管理模型」入口；若已经决定由卡片直接管理，则删掉不可发现的旧弹窗及其状态，避免保留半隐蔽入口。

## 七、本轮确认通过项与边界

- **弹窗键盘行为 PASS**：高级参数弹窗打开后焦点在弹窗内循环，Tab 可经过字段、取消、保存、关闭，Escape 关闭后不残留可见对话框。
- **接入渠道空提交 PASS**：空提交显示渠道名/API Key 字段级错误；只填渠道名后继续，渠道名保留、API Key 错误显示，网络侧未出现写请求。
- **危险操作预览 PASS**：打开空接入点的彻底删除确认后，依赖检查期间确认按钮禁用；检查完成后明确显示不可逆影响，并推荐「仅停用接入点（保留配置）」；本轮已取消，未执行删除/停用。
- **角色边界 PASS**：线上 `test-leader` 访问 `https://dydata.cc/admin/ai-config?view=channel` 得到清晰的「还没有 AI 配置权限」及返回工作台入口；没有把无权限用户留在空白页。
- **控制台复核 PASS**：本轮本地 owner 页与线上 leader 页均未见 error/warn；前次 `data-trae-ref` hydration 差异仍按自动化插件注入处理，不列为产品缺陷。
- **写入边界**：本轮没有执行同步、检测、停用、删除、改名、上下架或密钥保存；本地 dev 仍直连生产 Supabase，因此不能把上述通过项写成生产 owner 写入闭环已验收。

## 八、本轮证据索引

- 真实浏览器：本地 `company_owner` 页面完成模型/渠道视角、刷新、弹窗、表单中断、375/768/1024/1280/1440 视口与危险闸门复核；线上 `test-leader` 页面完成权限边界复核。
- 当前浏览器复现：视角切换 URL 为 `?view=model` / `?view=channel`；切换后后退实际到 `/dashboard`；375px 表格容器 `332px`、内部表格约 `977px`、未发现横向提示。
- 未覆盖：生产 owner 真实写入后回读、完整 tooltip 悬停、同步/检测/停用/删除执行结果、真实密钥探测与线上部署 SHA 对应页面行为。
