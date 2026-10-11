# UX 全链路审计（补充轮）— 后台 · 内容管理（/admin/content）

- 日期：2026-10-11
- 环境：本地 dev（localhost:3000）→ ⚠️ dev 直连生产 Supabase 库 → 全程只读纪律（破坏性最终确认一律不点）
- Persona：负责日常内容审核与数据维护的组长（非技术、时间紧：来此页＝定位异常作品 / 看证据 / 完成处理闭环）
- 账号：组长 `test-leader@dydata.test`（持有 `review_content` + `manage_videos`，可全功能审计）
- 浏览器：外部 Chrome（TRAE 浏览器桥接）+ Playwright 无头等效实测
- **审计完整度：partial**。响应式多断点、第二受限角色、破坏性写入未执行；本轮以「补前一轮 Codex 审计」定位，重点覆盖其未做的 URL 深链恢复、视图切换反馈、遮罩层吞点击、请求生命周期与性能线索。
- 与同日 [Codex 审计](file:///Users/mac/Projects/dydata/docs/archive/ux-audits/ux-audit-2026-10-11-content-management-codex.md) 的关系：**互补**。前一轮已坐实的 Critical（越界比例进评级）、High（去盘状态不一致、375px 不可读、键盘不可达行）本轮不重复，只在其交叉处做独立复核；本轮新增/坐实的是前一轮未覆盖的反馈、性能与深链类问题。

---

## 一、结论先行

核心浏览、搜索、筛选、排序、分页、详情证据链路可走通；**但列表的「状态切换」与「筛选弹层」两个高频交互存在明显的反馈缺失与点击被吞问题，长任务用起来会频繁怀疑"是不是卡了/点不动"**。本轮新增坐实 2 项 High、3 项 Medium。

| 维度 | 分 | 一句话 |
|------|----|--------|
| 反馈及时性 | **4** | 视图切换（全部↔归档）请求 10 秒级返回，期间**零加载态**（无骨架/转圈/禁用），用户会以为点了没反应 |
| 交互稳定性 | **5** | 筛选弹层关闭后残留全屏透明遮罩吞掉工具栏点击，多处「点击无效」的共同根因 |
| 状态可信度 | **6** | 异常视图混入「腰斩」经代码复核为**设计口径**（非 bug）；但深链排序参数静默失效 |
| 首屏性能 | **6** | 每次加载 `/api/admin/content/topic-library-status` 发 12 批请求、其中 6 批被 abort（重复取数） |
| 一致性 | **6** | 首屏 console 有 hydration mismatch 报错 |
| 信息密度/文案 | **7** | 需保留的分层合理；本期只补零散文案问题 |

---

## 二、发现（按严重度）

### 🔴 H1 — 视图切换（全部 ↔ 归档）10 秒级无任何反馈，用户会反复点击【本轮实测坐实】

**复现**：在工具栏点分段控件「归档」。

**实测读数（非推测）**：点击后服务端 `GET /api/admin/content/list?view=trash&scope=team` **耗时 11.7 秒**返回（请求 t=…716291 → 响应 t=…728037）。期间以 12 次/秒采样，全程仍是旧态：分段控件「全部」仍高亮、`共 2149 条`、原 20 行、URL 无变化——**直到数据到达才一次性翻转**。点「返回全部」同样滞后（8 秒采样内无响应）。

**关键缺陷**：全程 `loading:false`、`aria-busy` 数量为 0，**没有任何加载态反馈**（无骨架屏、无转圈、无按钮禁用态）。切到归档最终态为 `?view=trash&scope=team&…`、`共 16 条`。

**影响**：归档/返回是审核闭环里的高频动作。10 秒无反馈＝用户认为「点了没反应」，会重复点击、怀疑页面坏了。违反「用户动作须有即时反馈」。

**建议**：切换即进入 loading 态（分段控件显示 spinner / 列表给骨架 / 按钮禁用防重复点），把「正在加载归档…」状态显性化；同时排查该接口为何 10s+（是否与列表数据量/选题库状态耦合）。

### 🔴 H2 — 筛选弹层关闭后残留全屏透明遮罩，吞掉工具栏点击【本轮实测坐实】

**复现**：打开「筛选」弹层 → 关闭（点别处/Esc）→ 再点「异常」「时间」等工具栏控件。

**实测**：点击无反应。DOM 中残留一层 Base UI portal 的 `role="presentation" data-base-ui-inert` 全屏遮罩（用 `clip-path` 在弹层位置"挖洞"，其余区域仍覆盖整个页面），拦截了所有底层点击。需再按 Esc 或点一次空白处才恢复。这是本轮多处「点击无效 / hit test 失败」的**共同根因**（此前多轮把「归档按钮点不动」误判为偶发）。

**影响**：任何"关掉筛选再点别的"的正常操作都会遇到；自动化与键盘用户尤其容易卡住。

**建议**：确认弹层关闭时 portal/遮罩是否被正确卸载；若依赖动画结束卸载，需保证关闭后遮罩即时 `pointer-events:none` 或移除，不能让 inert 层悬停吞点击。

### 🟠 M1 — 深链不恢复排序，静默回落默认排序【本轮代码坐实，非推测】

**复现**：直接访问 `/admin/content?anomaly=1&sort=interaction_rate&dir=asc`。

**实测**：异常开关正确恢复（343 条），但**排序未恢复**——表头仍是「▼ 发布时间」，互动率列无箭头，首行是异常/腰斩混排而非「互动率最低在前」。

**根因（代码坐实）**：[content-list-state.ts L30](file:///Users/mac/Projects/dydata/src/lib/content/content-list-state.ts)（实际路径 `src/lib/content/domain/content-list-state.ts`）`const [sortField, setSortField] = useState<SortField>("published_at")` —— **排序字段硬编码初始值，从不读 URL**。而 URL 里其它筛选（anomaly/view/scope/timeRange/playBucket…）都能写入并恢复，唯独排序除外，属半套 URL 状态。

**影响**：用户把「按互动率升序找最差作品」的视图分享/收藏 / 刷新后，看到的不是同一排序，会得出错误结论。对比：`?view=trash` 深链恢复正确（16 条）。

**建议**：排序字段与方向一并纳入 URL 读写（与其余筛选同源），入参非法时安全回落到默认排序。

### 🟠 M2 — 每次加载重复取选题库状态：12 批请求、6 批被 abort【本轮实测 + 代码坐实】

**复现**：任意一次进入/刷新 /admin/content。

**实测（network）**：`POST /api/admin/content/topic-library-status` 共 12 次，其中 **6 次 `ERROR: signal is aborted without reason`**，另 6 次成功。

**根因（代码坐实）**：[content-topic-library.ts L99-106](file:///Users/mac/Projects/dydata/src/app/(app)/admin/content/content-topic-library.ts#L99) 的 `useEffect` 依赖 `videos` 数组；首屏 `videos` 会变化（数据到达/重渲染），effect 二次触发 → [L59](file:///Users/mac/Projects/dydata/src/app/(app)/admin/content/content-topic-library.ts#L59) `topicStatusAbortRef.current?.abort()` 取消在途的 6 批、再发 6 批新请求。abort 本身是"取消过期请求"的设计，但**每次加载都白跑 6 批请求**，让选题库状态的加载成本翻倍。

**影响**：列表越重越明显；是本页"重、慢"的直接来源之一（1800+ 条全量分批 + 首批作废）。

**建议**：用稳定的签名（[buildTopicLibraryStatusSignature](file:///Users/mac/Projects/dydata/src/app/(app)/admin/content/content-topic-library.ts#L22) 已存在）做 effect 键，或在 effect 入口先比对签名命中即跳过，避免同一批 `videos` 二次发起；确认 `videos` 引用为何在首屏变化（是否可在数据容器层稳定引用）。

### 🟠 M3 — 首屏 console 存在 hydration mismatch 报错【本轮实测坐实】

**实测**：首屏 console `[error] A tree hydrated but some attributes of the server rendered HTML didn't match the client properties…`，栈回指 [NavBarClient](file:///Users/mac/Projects/dydata/src/app/(app)/layout.tsx)（`nav` 渲染层：`isScrolled` 等）。每次加载稳定复现。

**影响**：属框架级告警，不会白屏，但会造成属性不被修补、潜在交互时序问题，且污染 console（排障时噪音大）。

**建议**：定位 `isScrolled` / 首帧差异来源，改为挂载后计算或加 suppress 条件的精确收敛（不要全量 suppress）。

### 🟡 L1 — 下拉首项是占位文案，语义含混【本轮实测】

时间下拉首项为「时间」、人员下拉首项为「人员」，语义上等同"全部/不限"，但无「全部」字样。用户无法确认"是否已恢复全选"（尤其刚从某成员切回时）。建议首项改为「全部时间」「全部成员」。

### 🟡 L2 — 人员下拉 / 账号下拉：35 项扁平、无搜索、无分组、混入测试账号【本轮实测】

人员下拉 35 项扁平列表，无搜索框、无团队分组；混入 `批次5-A组员2`、`测试组员`、`测试组长` 等测试数据。（与 Codex 报告 Medium「账号同名无区分」同源，此处补充"无搜索/无分组/测试数据混入"三点。）

### 🟡 L3 — 多条件筛选无摘要、无逐条删除【本轮实测】

叠加「异常 + 近7天」后，无「+N」折叠、无条件胶囊、无单条 ✕。清空只能靠条件激活后才出现的「重置」（**全量清除**）。条件一多，用户难以"一眼看清当前筛了什么、单独撤掉哪个"。

### ⚪ 观察（不列缺陷，供产品确认）

- **归档视图与全部视图表头完全一致，且两视图都无「操作」列**：归档 16 条行内没有任何恢复/永久删除入口。与 Codex 报告"归档详情里能看到恢复/永久删除"并不冲突（操作在详情抽屉内），但**列表层没有任何行内批量处理入口**，审阅 16 条需逐条开详情。产品上若接受即可，仅提示。
- **自定义播放区间为即时生效**（`playMin/playMax` 输入即筛选），无"确认"按钮——与"选即生效"的其它筛选一致，符合设计；实测 `playMin=2000&playMax=5000` → 474 条，正确。
- 深链 `?videoId=<不存在的ID>`：**整页替换为**「未找到对应卷册 … 回到工作台首页」错误页（非仅"抽屉不开"）。属**有意兜底**，且提供了回首页出口，行为合理；仅提示：误粘错 ID 会丢整个列表上下文。

---

## 三、已复核并排除的疑点（前序候选）

| 前序疑点 | 本轮结论 | 证据 |
|---|---|---|
| 异常开关混入「腰斩」是 bug？ | **排除，属设计口径** | `anomaly=1` 走 [classifyVideoAnomalyBucket() !== null](file:///Users/mac/Projects/dydata/src/app/(app)/admin/content/content-list-filters.ts#L149)；腰斩（halved）是合法桶（[video-anomaly L136](file:///Users/mac/Projects/dydata/src/lib/video-anomaly.ts#L136)）。实测异常视图 343 条前 15 行含 1 行「腰斩」，与按钮计数一致。 |
| 「复制文案」失败？ | **未能证实为产品缺陷** | 实测出 toast「复制失败，请重试」，但自动化 `element.click()` 非可信用户手势，剪贴板 API 拒绝属环境限制。代码 [handleCopyContent](file:///Users/mac/Projects/dydata/src/app/(app)/admin/content/content-detail-dialog.tsx#L100) 成功/失败均有反馈（成功「文案已复制到剪贴板」），逻辑正确 → 需真实浏览器人工复核。 |
| toast 里出现 JS 报错栈（查看详情）| **排除，仅开发环境** | [feedback-toast L70-81](file:///Users/mac/Projects/dydata/src/components/ui/feedback-toast.tsx#L70)：仅 `NODE_ENV === "development"` 自动附栈，生产不出现。 |
| 首触欢迎弹窗"不弹出"？ | **降级为"时序不稳定"，非硬 bug** | 清除 `content-review-onboarding-seen` 并整页刷新后，引导层**未**出现（`useEffect`+`setTimeout(0)` 未触发）；但后续由某次交互（点自定义区间）触发的重渲染中，引导层**正常弹出且可关闭、关闭后正确写入 localStorage**。即机制可用但触发不稳定。建议改为在 `useEffect` 内直接判断（去掉 `setTimeout(0)`）以避免首帧竞态。 |
| 破坏性确认横幅 | **开-取消安全通过** | 「移入回收站」横幅原文：「确认移入回收站？该作品将隐藏，关联的成员绩效日报将同步作废。」按钮「暂保留 / 确认移入」；点「暂保留」后条数 2149 不变、无副作用。**未点最终确认**。 |

---

## 四、线程与场景结果（本轮覆盖）

### 线程 A：找异常 → 归档去留
- 目标：审核者定位异常作品并决定归档/恢复。
- 实测：异常开关（343，与脚本口径一致）→ 切归档（16 条，11.7s 无反馈 H1）→ 返回全部（滞后）。
- 结果：链路可达，但视图切换反馈缺失（H1）＋关闭筛选后遮罩吞点击（H2）阻断后续动作。

### 线程 B：深链/回访恢复
- 实测：`?anomaly=1` ✅ 343；`?sort=interaction_rate&dir=asc` ❌ 排序不恢复（M1）；`?view=trash` ✅ 16。
- 结果：URL 状态**部分**可用——筛选恢复、排序不恢复。

### 线程 C：详情与证据（复核）
- 实测：抽屉可开（row click），URL 追加 `videoId`；四格指标、快照明细、双列/单列截图、视频文案内容库、选题库状态（未达标准提示）均在。
- 结果：与前一轮一致，本轮无新增问题；`?videoId` 打开时 URL 保留了 `view=all&scope=team` 冗余参数（低，噪音）。

### 场景电池
| 场景 | 状态 | 结果 |
|---|---|---|
| 破坏性确认 | PASS（开-取消） | 横幅文案与按钮可读，「暂保留」可安全退出 |
| URL 深链 | PARTIAL | 筛选/view 恢复；排序不恢复（M1）|
| 键盘 | PARTIAL | Tab 顺序合理（导航→工具栏→表头→分页），焦点用 box-shadow 可见；但表格行仍不可聚焦（与 Codex High 一致）|
| 大数据量 | PASS | 2149 条 / 每页 20、50 均可；分页第 2 页「显示 21-40 条」正确 |
| 首次使用 | PARTIAL | 引导层可渲染可关闭，但首触触发不稳定（见上）|
| 误操作 | PASS | 不存在的 videoId → 明确「未找到对应卷册」+ 回首页出口 |
| 响应式 | 未覆盖 | 本工具集无法改视口，未做多断点（沿用 Codex 报告 375px FAIL 结论）|
| 第二角色 | 未覆盖 | 仅组长账号 |

---

## 五、Network / Console

- Console：1 类稳定 error——hydration mismatch（M3）；其余无。
- Network：列表/选题库状态请求均无非 2xx；**唯异常是 6 次 topic-library-status 被主动 abort**（M2，属重复取数副作用）。
- 未覆盖：生产 RLS、真实受限角色、剪贴板真实写入。

---

## 六、优先级建议

1. **P0 / High（H1）**：视图切换补加载态，杜绝"10 秒无反馈"；顺带排查该接口 10s+ 的根因。
2. **P0 / High（H2）**：修复筛选弹层关闭后残留遮罩吞点击（影响面最大、最易复现）。
3. **P1 / Medium（M1）**：排序纳入 URL 读写，使深链/刷新排序一致。
4. **P1 / Medium（M2）**：消除选题库状态重复取数（首屏 12→6 批）。
5. **P2 / Medium（M3）+ Low**：修 hydration 告警；下拉占位改「全部XX」；人员/账号下拉补搜索与分组、清测试数据；补多条件摘要与逐条删除。

---

## 七、Fixed-and-Verify

本轮按"只审计、不施工"收口：**未修改任何业务代码、未执行任何写入型操作**（破坏性按钮只开确认横幅后取消）。若进入修复轮，建议按 P0(反馈/遮罩) → P1(深链/重复取数) → P2(告警/文案) 顺序，每项用同一条真实链路复验并保留本轮读数（11.7s 切换、6 批 abort、hydration error）作对照。
