# AI 配置中心「体验优化」改动审查

> **审查人**：WorkBuddy（阿禅委托，只读审计）
> **审查对象**：`/Users/mac/Projects/dydata` 工作区未提交改动（HEAD `ccf239b7`），共 11 文件 `+613 / −710`
> **审查日期**：2026-10-07
> **对照基线**：HEAD `ccf239b7` 独立 worktree（`/tmp/dydata-before`，审查后已删除）
> **审查方式**：静态取证（`git diff` / `git grep` / `npx tsc` / `eslint` 基线对比 / 全量测试）＋ **真实浏览器渲染**（自建两份 dev server：改动后 `:3100`、基线 `:3101`，Chromium 1440×900 + 390×844，读 `getComputedStyle` 与 `document.querySelectorAll`）
> **审查纪律**：不读 className 下结论，一律以计算样式与实测 DOM 为准；发现与推算冲突时以实测更正自己（本轮已更正一次关于"通道模式入口丢失"的误判）。

---

## 一、结论摘要

**改动方向正确、视觉层面基本达标，但工程上不过关，且有一处会导致水合错误的硬伤。**

| # | 结论 | 等级 |
|---|---|---|
| 1 | `business-functions-panel.tsx` 5 处把 `asChild` 用在 `@base-ui/react` 的 Tooltip 触发器上 —— `tsc` 报 5 处 TS2322；真实浏览器实测「业务功能调度」表格内 **19 处 button 嵌套 button**、React 抛水合错误。**`gate:static` 必红，dev 控制台必报错。** | **P0** |
| 2 | 「模型视角」原有的 搜索框 / 服务商下拉 / 状态下拉 **被整体删除**，不达第二批计划所写的「筛选栏裸铺」（要求保留、只是去掉外壳）。实测：改动前 3 个控件全部存在，改动后 3 个全部为 0。 | **P1** |
| 3 | 删除 UI 后遗留 **12 处死代码**（`eslint` 告警 4 → 16）。含 `stats`、`hasActiveFilters`、`clearPoolFilters`、`Search`、`Select*`×5、`viewMode`/`onViewModeChange`×2。违反 AGENTS.md「零垃圾残留」。 | **P1** |
| 4 | 第一批计划第 4 项「试跑结果轻柔渐显 + 发丝边注」**未落地**，且承载它的卡片已被删除，试跑结果只剩 5 秒 toast。计划里这条验收项已不可能成立。 | **P1** |
| 5 | 弹窗标题 `17px`、说明文字 `11px` 越界 —— 设计规范 §1.2 封闭律只允许 28/20/18/14/13/12。 | P2 |
| 6 | 计划第三批明确要求截图识别行第二列做成 `[百度OCR+归位 \| 单视觉直识]` 分段切换，实现里改放进了 ⚙ 弹窗（功能未丢，但计划与实现不符）；同时该行**新增了计划中不存在的「停用该功能」**入口。 | P2 |
| 7 | 触屏防误触只挡住了"滑动连选"，单击 Toggle 仍**无条件执行**；且触摸分支不重置 `isMouseDownRef`。 | P2 |
| 8 | `docs/Claude设计哲学.md` 与实现改动**同批修改**，且把既有句子**替换**成给本次改动背书的表述 —— 规范变更不应由改动方在同一个批次里自证。 | P2 |
| 9 | `DialogContent` 固定 `sm:max-h-[540px]`，在「宽 ≥640px 且视口高 <572px」时会超出视口且 `overflow-hidden`，内容不可达。 | P3 |

---

## 二、主要发现

### F-01（P0）`asChild` 不被 base-ui 支持：类型报错 + 运行期 button 嵌套 + 水合错误

**根因定位**：`src/app/(app)/admin/ai-config/components/business-functions-panel.tsx:313 / 331 / 348 / 421 / 438`

`@base-ui/react` 的触发器**没有 `asChild`**（那是 Radix API），只认 `render={<Comp/>}`。同一批改动里 `compute-pool-panel.tsx` 用的是**正确写法** `render={...}`，两处不一致。

**证据 1 — 类型检查（实测命令与读数）**

```
$ npx tsc --noEmit --pretty false
business-functions-panel.tsx(313,41): error TS2322: ... Property 'asChild' does not exist on type ...
… 共 5 条（313 / 331 / 348 / 421 / 438）
```

**证据 2 — SSR 探针（同一组件、两种写法对照）**

```
ASCHILD_HTML=<button … data-slot="tooltip-trigger"><button … aria-label="调整高级参数">X</button></button>
ASCHILD_NESTED_BUTTON=true     ← 嵌套
RENDER_HTML=<button … data-slot="tooltip-trigger" aria-label="…">Y</button>
RENDER_NESTED_BUTTON=false     ← 正确
React does not recognize the `asChild` prop on a DOM element.
```

**证据 3 — 真实浏览器（`localhost:3100`，登录 阿禅 后进 `/admin/ai-config`）**

```
nestedInteractive: 19 处，全部 parentDataSlot = "tooltip-trigger"
  试跑真实用例 / 调整高级参数 / 停用该功能 ×（截图识别行 + 全部业务行）
CONSOLE  In HTML, <button> cannot be a descendant of <button>.
         This will cause a hydration error. … <tr data-feature-key="ocr_screen…">
CONSOLE  <button> cannot contain a nested <button>.
```

对照基线（`localhost:3101`，HEAD）：`nestedInteractive: []`，控制台零错误。

**业务影响**：① 该页只要进 dev 就报错、`gate:static` 直接红；② 每个图标按钮外多套一层可聚焦 `<button>`，键盘用户 Tab 会踩两拍；③ 页面右下角常驻 Next.js 错误浮标 —— 截图已留存。

**修法**：照 `compute-pool-panel.tsx` 的写法改成 `render={<Button … />}`（注意此时 `aria-label` 要写在 `<Button>` 上，`render` 变体会把它透传给真实元素，实测已验证读屏名可用）。

---

### F-02（P1）模型视角的搜索 / 筛选能力被删除，不是「裸铺」

第二批计划原文：「**筛选栏裸铺**：搜索框、服务商下拉、状态下拉直接与区段标题同轴裸铺于底板」。实现是**整体删除**（`compute-pool-panel.tsx:421` 起的整个筛选栏 hunk 被移除）。

**实测（同一账号、同一流程，两种基线各跑一次）**

| 视图 | 控件 | 改动前 :3101 | 改动后 :3100 |
|---|---|---|---|
| 模型视角 | `input[placeholder="搜索模型"]` | ✅ 存在 | ❌ 不存在 |
| 模型视角 | `[aria-label="筛选服务商"]` | ✅ 存在 | ❌ 不存在 |
| 模型视角 | `[aria-label="筛选状态"]` | ✅ 存在 | ❌ 不存在 |
| 模型视角 | 「没有符合筛选条件的模型」空态 | ✅ 存在 | ❌ 已随逻辑删除 |

同时 `activeGroups.map` 取代了 `filteredGroups.map` —— 也就是说筛选逻辑还在跑（`filteredGroups` 仍被一个 effect 消费），但**用户已经没有入口**。

**影响**：模型数增长后，管理员无法按名称/服务商/状态定位模型。**需阿禅拍板**：是"恢复筛选并裸铺"（推荐，符合计划原文），还是"确认不要筛选"（那么必须连同 `searchText`/`providerFilter`/`statusFilter`/`filteredGroups`/`hasActiveFilters`/`clearPoolFilters` 一起删干净，见 F-03）。

---

### F-03（P1）新增 12 处死代码（`eslint` 告警 4 → 16）

**基线对比（同一命令、同一目录）**

```
改动前 /tmp/dydata-before：✖ 4 problems (0 errors, 4 warnings)
改动后 主工作区          ：✖ 16 problems (0 errors, 16 warnings)
```

新增的全部是 `@typescript-eslint/no-unused-vars`：

| 文件:行 | 残留 |
|---|---|
| `compute-pool-panel.tsx:4` | `Search` 图标导入 |
| `compute-pool-panel.tsx:22-26` | `Select` / `SelectContent` / `SelectItem` / `SelectTrigger` / `SelectValue` |
| `compute-pool-panel.tsx:80` | `stats`（＝原「服务商 N 家 · 启用密钥 N/M」的计算，界面已删、计算还在跑） |
| `compute-pool-panel.tsx:148 / 152` | `hasActiveFilters` / `clearPoolFilters` |
| `channel-pool-view.tsx:98 / 217 / 218` | `onViewModeChange`×2、`viewMode`（`ChannelPoolView`/`GroupPoolView` 的 props 已成死参数，调用点仍在传值） |
| `channel-pool-view.tsx:326` | `hasActiveFilters`（原「筛选出 N/M 家」计数） |

另有 `bindings-dialogs.tsx:33`、`sync-models-dialog.tsx:50` 两条「失效的 eslint-disable 指令」（改动前就有，属既有债）。

**说明**：`npm run lint` 退出码为 0（本仓 eslint 把 unused-vars 配成 warning），所以"0 报错"技术上成立 —— **但"0 告警"不成立**，且这批残留正是 AGENTS.md 明令禁止的"零垃圾残留"。`stats` 尤其值得注意：它是**活代码空转**，不是简单删导入。

---

### F-04（P1）第一批第 4 项未落地，且丧失落点

计划要求：`screenshot-recognition-card.tsx` 的试跑结果边注容器加 `animate-in fade-in duration-150`。

实测：

```
$ grep -rn "animate-in\|fade-in" src/app/(app)/admin/ai-config/
(无输出)
```

`business-functions-panel.tsx` 新写的 `handleOcrTrialRun` **只发 toast**，没有迁移被删卡片里的 `TrialResult` 状态与边注渲染；`formatLatency` 虽被引入，但只拼进 toast 文案。

**影响**：原先"试跑结果安静留在行下方、可反复对照"的形态退化为 5 秒即逝的 toast。第三批计划里写的「试跑结果在行下方以发丝边注轻柔呈现」同样未实现。**第一批第 4 条验收项在现状下不可能通过。**

---

### F-05（P2）字号越界（封闭律）

| 位置 | 实测 | 规范要求 |
|---|---|---|
| `bindings-dialogs.tsx:71` `DialogTitle` | `fontSize: 17px / fontWeight: 500` | §1.1 章节定名＝**18px**（明确覆盖 `DialogTitle`）；§1.2 封闭律禁用 17px |
| `bindings-dialogs.tsx:130 / 145 / 179` | `text-[11px]` ×3 | §1.2 封闭律禁用 11px；元数据应为 **12px** |

对照：改动前 ai-config 页主区有 1 处越界字号（11px），改动后主区越界字号为 **0** —— 说明这批**修掉了旧的越界，但在弹窗里新引入了新的越界**。弹窗不在 `main` 内，所以我第一次扫描主区时未捕获，是打开弹窗实测才拿到。

---

### F-06（P2）计划与实现不符（第三批）

| 计划第三批要求 | 实现 |
|---|---|
| 截图识别行第二列＝`[百度OCR+归位 (推荐) \| 单视觉直识]` 分段切换 | 第二列只放静态说明文字；**分段切换挪进了 ⚙ 弹窗**（`bindings-dialogs.tsx` 的「识别通道模式」双卡） |
| 操作列 `[▶] [⚙]` 两个 | 实际 **三个**：试跑、调整高级参数、**停用该功能** |
| — | 「停用该功能」触发 `archiveFeature("ocr_screenshot")`，确认弹窗文案为「系统会保留当前配置与历史映射，但**前台将阻止发起该业务请求**」 |

**功能未丢**（通道模式确实还有入口，我第一轮推断它丢失，实测后更正）。但两点需确认：

1. 计划未批准的「停用」入口被加到了**首页日报核心依赖**的 OCR 功能上 —— 误停会让首页上传的截图识别整体失效（有 5 秒撤回窗口 + 二次确认，风险可控，但这是**产品决策**不是排版微调）。
2. 第三批**没有计划文件**（`docs/plans/` 只有第一、二批），但改动已落地 —— 与"计划归档是收尾动作"的约定不符。

---

### F-07（P2）触屏防误触只做了一半

`sync-models-dialog.tsx:73-95`：

```ts
const isMouse = (e.nativeEvent instanceof PointerEvent)
  ? e.nativeEvent.pointerType === "mouse"
  : !("ontouchstart" in window && navigator.maxTouchPoints > 0);

if (isMouse) {                      // ← 只包住了「滑动连选」的记账
  targetCheckedRef.current = nextState;
  isMouseDownRef.current = true;
}

setSelectedModelIds((prev) => {     // ← 勾选翻转仍无条件执行
```

- **做对的部分**：触摸时不再触发 `onMouseEnter` 连选（`isMouseDownRef` 保持 false），计划的主诉求达成。
- **残留**：`mousedown` 一律翻转该行勾选态。移动端浏览器在"点按 vs 滚动"上通常只对 tap 派发鼠标事件，所以**大多数情况不误选**；但 pointer 类型为 `pen` 或部分 Android 浏览器在起手即派发 `mousedown` 时，滚动起手行仍会被翻转。**推断，未做真机验证。**
- **另一个小坑**：`isMouse === false` 时不重置 `isMouseDownRef.current`（混合设备上可能残留 `true`）。

---

### F-08（P2）设计哲学文档与实现同批改动

`docs/Claude设计哲学.md` 本次被改了 9 行，除新增"三步视野缩放"外，**替换**了既有句子：

```diff
- 秩序带来的舒适是这么来的，不是靠把东西藏起来换取的安静。
+ 秩序带来的舒适是这么来的，它源于**全局高于局部的绝对克制**。
+ …你不能为了凸显某一个水杯或工具，就非要单独给它垫一个碟子或造一个外框（局部最优）…
```

这实质上是**在规范里写下本次改动的辩护词**（"不要给配角造外框"恰好对应删掉筛选栏/脱壳）。原句"不是靠把东西藏起来换取的安静"的语义被丢掉。

**建议**：规范文档的修改应独立成一次提交、单独评审，并在正文里说明改的是哪条既有约定、为什么；不要与实现改动混在同一批。

---

### F-09 / F-10 / F-11（P3）

- **F-09**：`bindings-dialogs.tsx` 的 `DialogContent` 同时有 `max-h-[calc(100dvh-2rem)]` 和 `sm:max-h-[540px]`。twMerge 视二者为同键不同变体，**都保留**，≥640px 时 `sm:` 后置取胜 ⇒ 宽 1280×高 520 这类窗口下弹窗 540px 超高、外层 `overflow-hidden` 且内容不可达。（推断，未在该视口实测）
- **F-10**：`bindings-dialogs.tsx:130` 的 `py-0.2` 是非法 Tailwind 类（静默无效）；`providers-dialogs.tsx`、`shelf-models-dialog.tsx` 也有同类写法（既有债，非本轮引入）。
- **F-11**：`ocr_screenshot_structure`（截图识别·文字结构化）这个功能键在页面上**没有任何 UI 入口**（`businessFeatures` 过滤掉它，表格置顶行只绑 `ocr_screenshot`）。**改动前也如此**，非本轮引入，但既然第三批说"截图识别并入总表"，顺手把这个缺口一起补掉更合理。

---

## 三、已达标项（实测对照）

| 项 | 实测证据 | 判定 |
|---|---|---|
| 顶部健康条呼吸排布 | 容器 `gap-y-2.5 gap-x-4` + `flex-wrap`；390px 下 `documentElement.scrollWidth === innerWidth === 390` | ✅ |
| 业务表表头字重 | 改动前 `12px / 500 / #78716C` → 改动后 **`12px / 400 / #78716C`** | ✅ 且**修正**了原违反 §1.1 的 500 |
| 第一列墨度字阶 | 实测 `13px / 400 / rgb(31,30,29)`（＝`#1F1E1D`） | ✅ |
| 页面主区越界字号 | 改动前 `{11: 1}` → 改动后 `{}` | ✅ |
| 视角切换器脱壳 | 容器 class 由 `p-0.5 rounded-lg bg-[#F1F1F0] border border-[#E2E2DF]/60` → `inline-flex items-center gap-1`；实测 `backgroundColor: rgba(0,0,0,0)`、`borderTopWidth: 0px`（改前 `#F1F1F0` + 1px） | ✅ |
| 顶部工具栏白盒消失 | `main` 内「白底+描边+≥150×50」的 div：改动前 9 个 → 改动后 7 个；消失的正是 `1280×50 "服务商…家·启用密钥…"`（工具栏白盒）与 `1280×115 "✦ 截图识别与结构化提取…"`（独立大卡） | ✅ |
| 副标题套话删除 | `innerText` 匹配：`多渠道密钥储备池` true→false、`业务优先，开箱即用` true→false | ✅ |
| 按钮文案精简 | `模型管理`→`模型`、`渠道管理`→`渠道`（实测按钮文本） | ✅ |
| 视角切换无重复实例 | 三个视角下 `button[aria-label^="切换至"]` 计数恒为 3（只有顶部一处） | ✅ |
| 被删组件无残留引用 | `grep -rn "screenshot-recognition-card\|ScreenshotRecognitionCard\|model-chain-select\|ModelChainSelect" src/ tests/ scripts/` → 0 命中；且 `git grep HEAD` 确认 `ModelChainSelect` 当时仅被 `bindings-dialogs` 引用（本轮换成 `ModelFamilySelect` 后成了死代码，删除正确） | ✅ |
| 截图识别「通道模式」入口未丢 | 打开 ⚙ 弹窗实测：`业务模型路由 · 截图识别`，含「识别通道模式」OCR+模型 / 视觉直识 双卡 | ✅（第一轮我误判为丢失，已更正） |
| 375～390px 无横向溢出 | `docW 390 / winW 390` | ✅ |

---

## 四、门禁复核表（汇报值 vs 实测值）

| 门禁 | 汇报的说法 | 实测 | 判定 |
|---|---|---|---|
| `npm run lint` | "0 报错" | 退出码 0，**但 ai-config 目录警告 4 → 16（+12 全部 unused-vars）** | ⚠️ 字面属实、实质隐瞒新增告警 |
| "零报错零类型警告"（第一批验收 §3） | 已通过 | `npx tsc --noEmit` → **5 条 TS2322** | ❌ **不属实** |
| 自动化测试 | "28 项全部通过" | 全量 `npm test` → **2088/2088 pass，0 fail** | ✅ 属实（但多为源码字符串断言，锁不住渲染） |
| 视觉核对：宽屏 + 375px 无重叠/溢出 | 已通过 | 390px 无横向溢出；宽屏排布正常 | ✅ 部分验证（未逐项核窄屏折行后健康点/徽章的对齐） |
| 交互核对：触屏滚动不误选 | 已通过 | **未做触屏/移动模拟**；代码层判定为"只做了一半" | ❌ **未验证** |
| 交互核对：试跑渐显 | 已通过 | 目录内 `animate-in/fade-in` 命中 0 | ❌ **未实现** |
| `gate:static` / `gate:roles` / `gate:browser` | 未提 | 未跑（`gate:static` 因 tsc 必红） | ⚪ 未验证 |

---

## 五、审计环境与边界

- **审计窗口**：2026-10-07 01:35 – 02:05（GMT+8）。窗口起止 `git diff --shortstat` 均为 `11 files changed, 613 insertions(+), 710 deletions(-)`、`git status --short` 未变 ⇒ **期间工作区稳定**，未受并发改动干扰。
- **对照基线**：`git worktree add --detach /tmp/dydata-before ccf239b7`（审查后 `git worktree remove --force` 已清理，主工作区零触碰；**未用 `git stash`**）。
- **dev server**：未动共享的 `:3000`（他人会话在跑）。自建两份：改动后＝工作区 rsync 副本 + `cp -al node_modules` 跑在 `:3100`；基线跑在 `:3101`。两者审查后已 `pkill` 并删除副本。
- **⚠️ 本轮踩到的环境坑（已写入长期记忆）**：Next 16 dev 会拦跨源 dev 资源，用 `http://127.0.0.1:3100` 访问时客户端**永不水合**、页面恒停在 SSR 骨架态（`/api/*` 一个请求都不发、控制台零报错），极易误判成"改动把页面改坏了"。改用 `http://localhost:3100` 后 3 秒即正常渲染。
- **只读承诺**：未修改任何被审代码、未 `commit`、未 `push`、未对生产库写入。唯一写盘是本报告与记忆文件。
- 登录使用 `docs/reference/测试账号.md` 的 `1305085564@qq.com`（company_owner）。**全程未点击任何保存/停用/试跑按钮**，只做 hover 与打开弹窗。

## 六、未验证项（不写成"通过"）

1. 触屏真机/移动模拟下的防误触（未跑设备模拟）。
2. 「试跑真实用例」的实际连通结果（有意未点，避免向线上渠道发真实 AI 请求）。
3. 渠道视角筛选栏改后的交互（只核了模型视角对比）。
4. `sm:max-h-[540px]` 在矮视口的实际表现（F-09，推断未实测）。
5. `gate:static` / `gate:roles` / `gate:browser` 三条门禁均未跑（其中 `gate:static` 已可确定会因 tsc 失败）。
6. 「模型视角需不需要筛选」属产品决策，本报告只陈述事实与差异，不代为判断。

## 七、建议修复顺序

1. **先把 `asChild` 全部换成 `render={<Button …/>}`**（照同批 `compute-pool-panel.tsx` 的写法），恢复 `tsc` 与 dev 控制台干净 —— 这是唯一的 P0。
2. **拍板模型视角筛选**：保留则按计划"裸铺"回填；不要则连带清掉 `stats` / `hasActiveFilters` / `clearPoolFilters` / `Search` / `Select*` / `viewMode` 等 12 处死代码，把 `eslint` 告警压回 4 条。
3. **补齐或删除第一批第 4 项**：要么把 `TrialResult` 边注迁移进表格行并加 `animate-in fade-in duration-150`，要么把这条从计划验收里划掉，别留在"已完成"的汇报里。
4. 弹窗标题 `17px → 18px`、`text-[11px] → text-[12px]`（3 处），顺手清 `py-0.2`。
5. 把 `docs/Claude设计哲学.md` 的改动从这一批里**拆出来单独评审**。
6. 确认截图识别行要不要「停用」入口（计划里没有）；若保留，建议文案与后果提示再明确一档。

---

## 八、第二轮（同日）：阿禅拍板后的修复与复验

> **触发**：阿禅对报告里两个待拍板项给出决策 —— ① 模型视角「**不需要筛选**」；② 截图识别行的「停用该功能」要**保留**：「不加它会不完整，它也的确需要可以停掉的功能，哪怕未来也许永远不会停掉」。
> **性质变化**：本轮**不再是只读**，已修改 3 个实现文件。

### 8.1 P0 已修：`asChild` → `render`

`business-functions-panel.tsx` 的 5 处全部改为全仓统一写法 `TooltipTrigger render={<Button …/>}`（对应「试跑真实用例 / 调整高级参数 / 停用该功能 × 截图识别行 + 业务行」5 个图标按钮）。

| 验证面 | 修前 | 修后 |
|---|---|---|
| `npx tsc --noEmit` | 5 条 TS2322 | **退出码 0，0 行输出** |
| 真实浏览器 `document.querySelectorAll('button button').length` | **19** | **0** |
| 控制台 `<button> cannot be a descendant of <button>` | 有 | **无（`ERRS=[]`）** |

页面共 62 个 `<button>`、零嵌套；业务功能表 10 行（全局默认 + 截图识别 + 8 项业务）全部正常渲染。

### 8.2 决策落地①：模型视角确认不设筛选 → 死代码清干净

按原报告「建议修复顺序」第 2 条的**「不要筛选」**分支执行：

| 残留 | 处理 |
|---|---|
| `compute-pool-panel.tsx`：`Search`、`Select*`×5、`PoolStatusFilter`、`searchText`/`providerFilter`/`statusFilter`、`filteredGroups`、`hasActiveFilters`、`clearPoolFilters`、`stats` | 全部删除 |
| `channel-pool-view.tsx`：`hasActiveFilters` | 删除 |
| `channel-pool-view.tsx`：`viewMode` / `onViewModeChange`（`ChannelPoolView`、`GroupPoolView` 上已成死参数） | 从 props 接口 + 两处调用点一并删除 |

**保留项（有功能，非死代码）**：健康条「N 个模型无可用渠道」的聚焦能力改为直接消费 `report` 的 `noChannelModelIds`，不再依赖已删的 `statusFilter`；点击后滚动定位行为与改前等价。**注意**：渠道视角自带的搜索框/状态下拉是**原设计**，未在本次清理范围（实测渠道视角控件仍在）。

复验（逐文件对照 HEAD 基线，`git show HEAD:<file> | npx eslint --stdin`）：

| 文件 | HEAD | 现在 |
|---|---|---|
| `channel-pool-view.tsx` | 0 | 0 |
| `compute-pool-panel.tsx` | 0 | 0 |
| `business-functions-panel.tsx` | 0 | 0 |
| `bindings-dialogs.tsx` | 2 | 1（净减 1） |
| `sync-models-dialog.tsx` | 1 | 1 |
| `model-manager-dialog.tsx`（本轮未改） | 1 | 1（既有债） |

目录整体：**8 warnings → 3 warnings，0 errors**；⇒ 本批**不再引入任何新告警**，且较基线净减 1 条。
真实浏览器复验模型视角：`搜索框 0 个 / 状态筛选 0 个`。

### 8.3 决策落地②：截图识别「停用该功能」保留，并核实链路真的有效

该入口此前**已存在**（原报告 F-06 已记录），本轮**未新增代码**，只逐环取证：

| 环节 | 证据 | 结论 |
|---|---|---|
| UI 入口 | 真机读该行按钮：`["选择调度模型系列","试跑真实用例","调整高级参数","停用该功能"]` | ✅ 四入口齐全 |
| 二次确认 + 撤回 | `ConfirmDialog` + 5 秒撤回 toast | ✅ |
| 服务端可归档 | `feature-catalog.ts:23`：`ocr_screenshot` → `group:"business", routing:"binding"`，过 `requireManageableBusinessFeature` | ✅ |
| 数据库白名单 | `supabase/migrations/20260825120000` 的 `manage_ai_feature_lifecycle` 白名单含 `ocr_screenshot` / `ocr_screenshot_structure` | ✅ |
| **归档真的拦得住** | `src/lib/ai/client.ts:660` `lifecycleState === "archived"` → 抛「该 AI 功能已归档」；两条 OCR 链路都带 featureKey（`route.ts:140`=`ocr_screenshot`、`baidu-channel.ts:72`=`ocr_screenshot_structure`） | ✅ 不是 UI 摆设 |
| 可恢复 | 「已停用的功能」折叠区按 `lifecycleState === "archived"` 渲染 + `restoreFeature` | ✅ 闭环 |

**未做**：没有真机点一次「停用」。原因：该验证环境的 `.env.local` 指向**生产库**（`gcrhhxaopomtposmahsw.supabase.co`），不宜制造真实写入；真机部分只做了只读动作（登录、切换视角、读 DOM、截图）。若要在本地库实测，需先 `supabase start` 并用 `127.0.0.1:54321` 起独立实例。

### 8.4 本轮后仍未处理（承接原编号）

| 编号 | 项 | 状态 |
|---|---|---|
| F-04 | 第一批第 4 项「试跑结果轻柔渐显」 | **仍未落地**，但适用对象已变：承载它的卡片被删后，试跑结果改走 `feedbackToast`（组件自带进出场动画），原「结果边注容器」已不存在 ⇒ 建议从计划验收里划掉，或另行设计行内边注 |
| F-05 | 弹窗 `17px` / `11px` 越界字号 | 未动 |
| F-06 | 第三批无计划文件 | 未动 |
| F-07 | 触屏单击翻转仍无条件执行 | 未动 |
| F-08 | 设计哲学文档与实现同批改 | 未动 |
| F-09 / F-10 / F-11 | 矮视口弹窗 `max-h`、`py-0.2` 非法类、`ocr_screenshot_structure` 无 UI 入口 | 未动 |
| — | 本批 11 个文件仍未 `commit`、未 `push` | 未动（等阿禅指示） |

### 8.5 本轮复现命令与读数

```
npx tsc --noEmit                              → 退出码 0，0 行输出
npx eslint "src/app/(app)/admin/ai-config"    → 3 problems (0 errors, 3 warnings)
npx tsx --test <ai-config 5 个测试文件>         → 40/40 pass, 0 fail
npm test                                      → 2088/2088 pass, 0 fail（26.2s）
真实浏览器（localhost:3100，隔离副本；对生产库只读）
  nestedButtons = 0
  ocrRowButtons 含「停用该功能」
  模型视角：搜索框 0 / 状态筛选 0
  控制台 ERRS = []
```

**本轮仍未跑**：`gate:static` / `gate:roles` / `gate:browser`（含 `next build`）。
