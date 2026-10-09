# UX 全链路审计 — AI 配置中心（/admin/ai-config）

- 日期：2026-10-10
- 环境：本地 dev（localhost:3000），⚠️ dev 直连生产 Supabase 库 → 全程只读纪律
- Persona：阿禅（公司负责人，非技术，时间紧；来此页＝确认 AI 在跑、切模型、加渠道、排障）
- 模式：严格找茬模式
- **审计完整度：部分审计（partial）**。响应式 4 档、键盘-only、危险闸门依赖预览、停用/恢复、试跑、同步/巡检/检测执行因浏览器 resize 被安全策略阻止 + 子代理步数预算耗尽 + 生产写保护纪律，未能实测；下列"未覆盖清单"如实标注，不臆测。

---

## 一、结论先行（评分，拉开差距）

| 维度 | 分 | 一句话 |
|------|----|--------|
| 状态可信度（数字对不对得上） | **5** | 同一行三列口径打架，老板无法判断 AI 到底能不能用（H1） |
| 首屏效率与反馈 | **6** | 登录疑似卡 30 秒无进度（H2，待线上复核）；刷新按钮反馈弱 |
| 操作可预期性 | **6** | 行内下拉"点一下就保存"无确认，与弹窗"要点保存"两套语义并存（M3） |
| 防错与可恢复 | **7** | 停用走 5 秒乐观撤回是亮点，但刷新即丢（M2）；危险操作有依赖闸门（未实测） |
| 信息密度与文案 | **7** | 冗余列渠道名串过长、装饰文案无信息量 |
| 视觉与布局 | **8** | 发丝表格、留白克制，桌面 1440 观感在线（响应式未测，存疑） |

---

## 二、发现（按严重度）

### 🔴 H1 — 业务功能调度表三列口径混用，字面自相矛盾【实测 + 代码坐实】

**复现路径**：登录 → 进 /admin/ai-config → 看「全局默认」这一行：
- 「调度模型系列」下拉：**GPT-6 Sol（5 个渠道就绪）**
- 「渠道冗余与健康度」列：**共 5 条：● 全部未就绪**（红点）
- 「运行状态」列：**● 运行中**（绿点）

三句话同屏：5 个就绪 / 全部未就绪 / 运行中。截图证据：`p0-data-row-global-default.png`。非全局默认行同样中招——「截图识别」行下拉 **Claude 4.5 Haiku（4 个渠道就绪）**，冗余列却把 **api-tang ChatGPT、api7 default、api9 gpt**（这些是 GPT 系渠道）和 **api1 claude**（才是 Haiku 渠道）混在一起列，模型名与渠道名对不上。

**根因（代码坐实，非推测）**：同一行三列各用一套"可用性"定义：
- 下拉"N 个渠道就绪"＝ `schedulableChannelCount`（调度口径：三层启用＋运行时健康未冻结）— [model-family-select](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/model-family-select.tsx#L58) ← [availability L280](file:///Users/mac/Projects/dydata/src/lib/ai-config/availability.ts#L280)
- 冗余列"就绪/未就绪"＝ `health`（检测口径：必须真跑过健康检测才算 healthy，没测＝untested＝"未就绪"）— [business-functions-panel L68-71](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/business-functions-panel.tsx#L68) ← [availability L208](file:///Users/mac/Projects/dydata/src/lib/ai-config/availability.ts#L208)
- 运行状态"运行中"＝ 又用 `schedulableChannelCount>0`（调度口径）— [L188-194](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/business-functions-panel.tsx#L188)

→ 调度口径说"就绪"，检测口径说"未就绪"，**两套数都"对"，但用同一个词"就绪"表达相反含义**。

**影响**：这是该页的**主任务**（"AI 到底在不在跑"）的核心读数。老板看到自相矛盾的数字，要么误以为一切正常而错过故障，要么反复点"同步/检测"去"修"一个没坏的东西。信任直接受损。

**建议（最小改动）**：三列统一到**调度口径**做"能不能跑"，检测口径只用于"健康度明细"。具体：① 冗余列把"未就绪"改名为"待检测"（untested 的本义），与"就绪"不再同词反义；② 下拉括号里的"N 个渠道就绪"改为"N 个渠道可调度"，与冗余列"共 X 条"的口径词对齐；③ 截图识别行冗余列应只列该模型系（Haiku）的渠道，过滤掉 GPT 系——疑似 `report.modelFamilies.find(f=>f.modelId===modelId)` 取到的 channels 未按 modelId 收敛，需复核 [ChannelRedundancyCell L55-56](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/business-functions-panel.tsx#L55)。**先定口径，再动 UI**（符合 AGENTS.md「统计口径改动先用真实数据抽查」）。

### 🟠 H2 — 登录后跳转「正在开启工作台...」持续 30 秒+ 无进度【实测，根因推测】

**复现**：/login 输入老板账号点登录 → 按钮变 disabled「正在开启工作台...」→ 等待 >30 秒未跳转（实测）。
**推测根因（待验证）**：dev 首访 /admin/ai-config 触发路由冷编译，阻塞客户端跳转；**生产大概率不存在**，但需 `npm run gate:browser` 或线上复核确认。**无论根因**：真实用户在此等待期看不到任何进度/预计时间，属焦虑点。若线上复现，建议加超时兜底文案或骨架。

### 🟡 M2 — 「停用该功能」乐观 toast + 5 秒定时器，刷新/关页即丢【代码坐实，未实测】

**复现路径（推演）**：点停用图标 → 确认「确认停止」→ 立刻 toast「已停用，5 秒内可撤回」→ **在 5 秒内刷新或关标签页** → `setTimeout` 未触发，`archiveFeature` 请求不发出 → 数据库里功能**仍是启用**，但前端已宣称"已停用"。
**代码**：[business-functions-panel L657-668](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/business-functions-panel.tsx#L657) — 先弹可撤回 toast，5 秒后才真正 `archiveFeature`。
**影响**：违反 AGENTS.md「UI 必须显示准确状态；乐观更新必须有回滚/补偿」。撤回设计本身是亮点，但"延迟提交"使中断窗口内状态不可信。**建议**：确认即写库，撤回＝再发一次 restore；或至少刷新后以库为准重渲染。

### 🟡 M3 — 改模型有两套保存语义，行内下拉"选择即保存"无确认【代码坐实 + 实测下拉展开】

- 表格行内「调度模型系列」下拉：点选即 `onChange → saveFeatureControl` 直接写库，**无确认、无"保存"按钮**（[L243-256](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/business-functions-panel.tsx#L243)）。
- 齿轮「调整高级参数」弹窗内同样有模型下拉，但那里要点「保存」才提交，启用开关是本地态（[bindings-dialogs L91-95](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/bindings-dialogs.tsx#L91)）。
**影响**：老板不知道"下拉点一下就生效了"，容易误改全站调度；且同一字段两种交互契约，心智不一致。**建议**：行内下拉改为"选择后出现确认/撤销条"，或明确 tooltip 提示"改选即生效"。

### 🟡 M4 — 接入渠道「优先级」输入 0/空被静默改成 50【代码坐实】

[add-key-dialog L519](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/components/add-key-dialog.tsx#L519) `Number(e.target.value) || 50`：用户输 `0`（想表达"最后兜底"）被静默变 50，无提示。违反 AGENTS.md「超长/非法输入应拒绝而非静默截断」精神。建议：非法值给字段级错误，不静默兜底。

### ⚪ L1 — `testAllKeys` 死代码【代码坐实】

[use-ai-config L337-364](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/hooks/use-ai-config.ts#L337) 定义了 `testAllKeys`，但全仓 `.tsx` 无任何调用（面板走本地 `handleTestAll`）。违反 AGENTS.md「未使用辅助函数验证后必须移除」。建议删除。

### ⚪ L2 — 冗余列渠道名串过长、无截断/计数

一行内把 4-5 个渠道全名平铺（"api-tang ChatGPT、api7 default、api1 default、api9 gpt、api tang Gemini 故障"），窄列下折行拥挤。建议"N 可用 · M 故障"聚合，悬停看明细（符合阿禅偏好：悬停提示解释，而非平铺）。

### ⚪ L3 — 底部装饰文案无信息量

[ai-config-shell L62-66](file:///Users/mac/Projects/dydata/src/app/%28app%29/admin/ai-config/ai-config-shell.tsx#L62)「算力底座静候调度 · 智能容灾与高可用」纯氛围，对操作无帮助。polish 级，可留。

---

## 三、实测通过项（对照，非表扬）

- 下拉展开：7 个选项、当前选中项有 selected 标记、**0 就绪项禁用置灰** → 作者知道要区分就绪数，只是没和冗余列/运行状态对齐口径（反证 H1 是口径未收口，不是不会做）。
- 控制台：无 JS 运行时错误；有 **React hydration 不匹配警告**（SSR/CSR 属性不一致，建议排查 `Date.now()` 类不确定性渲染，Medium 隐患）。
- 网络：加载期 32 条请求全 200，无 4xx/5xx；全程只读，**无意外写 POST**。
- 刷新配置按钮：tooltip 正常，点击可刷新。

---

## 四、覆盖统计

- 静态元素清单：约 40+ 交互元素（2 面板 + 7 弹窗 + 表格行操作）。
- 浏览器实测覆盖：页面加载、控制台、网络、刷新按钮、下拉展开态、P0 三列读数、会话有效性 ≈ **8 类**。
- **未覆盖（原因）**：
  - 响应式 4 档、键盘 Tab 遍历 — 浏览器 resize 被安全策略阻止 + 预算耗尽（**工具限制，非跳过**）。
  - 高级参数弹窗字段流、接入渠道完整校验流、危险闸门依赖预览、停用/恢复、试跑、同步/巡检/检测执行、各类开关 — 生产写保护纪律（**主动不点**）。
  - 二次用户（组长）访问 — 已代码确认 `/admin/ai-config` 需 `manage_system`＝仅老板，组长 redirect 回 /admin（[route-permissions L24](file:///Users/mac/Projects/dydata/src/lib/route-permissions.ts#L24)）。

---

## 五、修复优先级建议

1. **H1 口径统一**（先定口径→再改三列文案/过滤逻辑）— 直击主任务可信度。
2. **H2 线上复核登录耗时** — 若线上复现则加进度兜底。
3. **M2 停用改确认即写库** — 消除状态不可信窗口。
4. **M3 行内下拉加确认/提示** — 防误改全站调度。
5. M4 / L1 / L2 — 顺手收口。

> 补测建议：本次为 partial audit。响应式与危险闸门请在**预发/可写环境**或放宽写保护后单独跑一轮，尤其危险闸门的依赖预览 loading 与"更窄替代方案"文案可读性，是高价值未验证项。
