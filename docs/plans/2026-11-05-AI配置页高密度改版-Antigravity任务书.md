# AI 配置页高密度改版 · Antigravity 任务书

> 发给：Antigravity。出题与验收：CC。日期：2026-11-05。阿禅已拍板方案。
> 起点：本地分支 `codex/ai-config-logic-20261105` 的最新提交（含 `014c2263` 排序改动），在它上面改，不要从 `main` 开。

一句话目标：**配置页是用来"找"的，不是用来"读"的**。把大留白、卡片套卡片的版式，改成一屏能看到更多模型和渠道的高密度版式。只改样子，不改功能、不改文字、不改排序。

## 一、动手前必读（按顺序读完再动手）

1. `AGENTS.md`：项目规则。
2. `docs/系统架构与设计/视觉与数值手册.md`：§1.1 字号、§1.3 留白四级。所有数值只许从这里和下面两份里抄。
3. `docs/系统架构与设计/组件与场景契约.md`：§3.1 表格契约（行高、操作列"平时隐藏、鼠标移上去才出现"的做法）。
4. `docs/系统架构与设计/Claude设计哲学.md`：搜「克制嵌套」「高密度降噪」两条。
5. 参照样板：`src/app/(app)/admin/ai-config/components/business-functions-panel.tsx` 的桌面表格外框（第 289 行），`src/app/(app)/dashboard/history-list.tsx` 第 284 行的操作按钮隐藏写法。

## 二、最高铁律（违反任何一条即返工）

1. **只改这 7 个文件的 className 和 JSX 排布**：`ai-config-shell.tsx`，以及 `components/` 下的 `compute-pool-panel.tsx`、`compute-pool-header.tsx`、`model-family-card.tsx`、`model-channel-row.tsx`、`channel-pool-view.tsx`、`business-functions-panel.tsx`。`find-channels-panel.tsx` 只许改它最外层 div 的 className。其他文件一律不碰，包括 `hooks/`、`src/lib/`、所有 `*.test.tsx`、`tests/`。
2. **不许改逻辑**。不许加、删、改任何 props、handler、`useMemo`、`runCommand` 调用、条件判断。**唯一例外**：`model-family-card.tsx` 允许新增一个本地状态 `const [channelsExpanded, setChannelsExpanded] = useState(false);`，用途见 C3。
3. **排序一个字都不许动**。`useFrozenOrder(...)` 三处调用、`.sort(compareSelectableModels)`、`sortSyncGroups(...)`、`model-family-card.tsx` 里的 `sortedChannels` 原样保留。
4. **文字不许改**。按钮名、提示、计数、状态文案全部照旧。唯一允许删除的文字是渠道视角"供应模型"列表每行右侧的「供应已开启 / 未开启」标签（见 D4）。
5. **数值只从规范抄**。字号只有 14 / 13 / 12px；间距只有 `gap-1/2/3/5`、`space-y-1/2/3/5` 以及 `p-` / `px-` / `py-` 的整数档；圆角只有 `rounded-md` / `rounded-xl` / `rounded-2xl` / `rounded-full`；禁用半档（`gap-1.5`、`space-y-2.5` 等）。
6. **拿不准就跳过并记录**，不许猜。

## 三、目标尺寸（验收时逐项实测）

| 位置 | 现在（约） | 改完上限 |
|---|---|---|
| 模型标题行高度 | 两行字 + 下边框，约 70px | **≤ 44px** |
| 一条渠道行高度 | 66px（框 + 内边距 + 8px 间隔） | **≤ 40px**，行与行之间零间隔，只有一条细线 |
| 两个模型之间 | 16px 空隙 + 两层卡片边框 | 一条细线，零空隙 |
| 已停用的模型（收起时） | 约 175px | **≤ 44px**，只剩标题行 |
| 渠道视角左侧一条渠道 | 两行字，约 68px | **≤ 40px**，一行 |
| 渠道视角一条供应模型 | 两行字，约 60px | **≤ 36px**，一行 |
| 顶部状态条 | 约 66px | **≤ 48px** |

## 四、改动清单

### A. 外层与筛选行（`compute-pool-panel.tsx`、`compute-pool-header.tsx`、`ai-config-shell.tsx`）

| 编号 | 现在 | 改成 |
|---|---|---|
| A1 | 视角切换（`PoolViewSwitcher`）单独一行，下面"只看在用 / 全部模型"和搜索框再一行 | 合成**一行**：左边视角切换，紧跟"只看在用 / 全部模型"（只在模型视角显示，条件照旧），搜索框靠右（`ml-auto`，只在模型视角显示）。容器 `flex flex-wrap items-center gap-3` |
| A2 | 筛选行随页面滚走 | 这一行固定在顶部：`sticky top-[var(--app-top-offset)] z-[var(--z-sticky-nav)] -mx-1 px-1 py-2 bg-[#FCFCFB]/85 backdrop-blur-md`。往下翻 2 屏后它必须仍贴在导航栏下方、不被导航栏盖住 |
| A3 | 模型卡列表 `space-y-4`，每张卡自己有外框 | 列表外包**一个**框：`overflow-hidden rounded-xl border border-[#E2E2DF] bg-white divide-y divide-[#E2E2DF]`，里面的模型之间只靠这条分隔线，零空隙 |
| A4 | "未找到匹配的模型"空态 `rounded-2xl ... p-12` | 改 `rounded-xl ... p-6`，文字不动 |
| A5 | 面板根 `space-y-6`、模型视角容器 `space-y-4` | 都改 `space-y-3` |
| A6 | 顶部状态条 `gap-4 rounded-xl border ... p-4 shadow-card`，两个按钮 `h-8` | 改 `gap-3 rounded-xl border ... px-4 py-2`，去掉 `shadow-card`；两个按钮改 `h-7`。外层 `space-y-4` 改 `space-y-2` |
| A7 | `ai-config-shell.tsx` 根 `space-y-6`，第二个 section 有 `pt-1` | 根改 `space-y-5`，删 `pt-1` |

### B. 业务功能调度表（`business-functions-panel.tsx`）

| 编号 | 现在 | 改成 |
|---|---|---|
| B1 | 桌面表格每个 `TableCell` 写了 `py-3` | 删掉这些 `py-3`，回到表格契约默认的 `py-2.5`。`pl-4` / `pr-4` 保留。手机端卡片不动 |

### C. 模型视角（`model-family-card.tsx`、`model-channel-row.tsx`）

#### C1 模型卡：不再是卡片，是表里的一段

- 根节点：删掉 `rounded-2xl border p-4 space-y-4 shadow-card`。三种状态底色改成：停用 `bg-[#F7F7F6]/40 opacity-80`、没有能用渠道 `bg-[#FCFCFB]`、正常 `bg-white`（判断条件照旧）。
- 标题行：删掉 `border-b ... pb-3`，改成 `flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#FCFCFB]`。
- 标题行左侧**压成一行**：去掉 `space-y-1` 的上下两层，改成一个 `flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0`，里面依次放：模型名（14px 不变）、标识（12px mono 不变）、"暂时不可用"标签（条件不变）、"M 条渠道供货，N 条能用"及后面的提示（12px，原来那个 span 组整体搬过来）。
- 标题行右侧"为此模型找渠道""停用 / 恢复模型"两个按钮不变，一直显示。

#### C2 渠道行：从小框改成表格行

- `model-channel-row.tsx` 根节点：删掉 `rounded-xl border p-3 space-y-2`，改 `group px-4 py-2 text-[12px]`。三种状态底色：停用 `bg-[#F7F7F6]/60 opacity-70`、需要你处理 `bg-status-danger/[0.04]`、正常 `bg-white hover:bg-[#F7F7F6]`（条件照旧）。
- 第一层 flex 改成**桌面三列网格**，让所有模型的状态标签和开关上下对成一条竖线：
  `flex flex-wrap items-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_160px_112px] md:gap-3`
  第一列 = 箭头 + 渠道名，第二列 = 状态标签（左对齐），第三列 = 测试 / 开关 / 删除（`justify-end`）。手机宽度下仍是现在的折行排布。
- 测试按钮、删除按钮 `size-7` 改 `size-6`（图标 `size-3` 不变）。不改的话行高会被撑到 44px，达不到第三节的 40px。
- 状态列 160px 放不下"暂时歇着 · 几点再试"时，可加宽到 `200px`，同时写进交付清单。
- 模型卡里渠道列表容器 `space-y-2` 改成 `divide-y divide-[#E2E2DF]/60`，行与行零间隔。

- 渠道列表容器（`mainChannels.map` 外那层）`space-y-2` 改 `border-t border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60`：标题行和第一条渠道之间一条细线，渠道之间各一条细线，零间隔。

#### C3 已停用的模型默认收起渠道

- 新增的唯一本地状态 `channelsExpanded`（铁律 2），再加一行派生常量 `const isChannelsVisible = family.isShelved || channelsExpanded;`。
- `!family.isShelved` 时，在标题行最左边（模型名前）放一个只有图标的按钮：`<button type="button" onClick={() => setChannelsExpanded((v) => !v)} aria-expanded={isChannelsVisible} aria-label={isChannelsVisible ? "收起渠道" : "展开渠道"} className="inline-flex items-center text-[#78716C] hover:text-[#141413]">`，图标用已导入的 `ChevronRight` / `ChevronDown`，`size-3.5`。`aria-label` 是本次唯一允许新增的文字。
- 只把**渠道列表那一块**（含空态、主列表、已停用折叠区）包进 `{isChannelsVisible && (...)}`。「为此模型找渠道」面板**不许**包进去：停用的模型点了找渠道，面板照样要出来。
- 在用的模型（`isShelved=true`）不显示这个按钮，渠道一直展开。点「恢复模型」后它变成在用，渠道自然展开，不需要额外代码。

#### C4 次要按钮平时隐藏，鼠标移上去才出现

- 在 `model-channel-row.tsx` 顶部（import 下面）加一个样式常量，这是允许的：
  ```ts
  const REVEAL_ON_HOVER = "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 transition-opacity duration-150";
  ```
  `pointer-fine:` 表示只在有鼠标的设备上隐藏；平板、手机等触屏设备一直显示。`group-focus-within` 保证用键盘 Tab 进这一行时按钮也会出现。
- 套用到四处：
  1. 上下箭头外面那层 `div`（`flex items-center gap-1 shrink-0`）加上 `REVEAL_ON_HOVER`。按钮自己的 `disabled:opacity-30` 不动。
  2. 改名铅笔按钮直接加。
  3. 测试按钮外面包一层 `<span className={cn("inline-flex", !isTesting && REVEAL_ON_HOVER)}>`：正在测试时转圈图标必须一直看得见。测试按钮自己的 `disabled:opacity-30` 不动，所以要包一层，不能直接加在按钮上。
  4. 删除按钮直接加。
- **一直显示、不许隐藏的**：状态标签、开关、模型标题行的两个按钮、「需要你处理」的原因。
- 只许在渠道行根节点上加 `group`。模型卡根节点、列表外框都**不许**加 `group`，否则鼠标移到一个模型上，它下面所有渠道的按钮会一起冒出来。

#### C5 已停用的供应折叠区

- 外层 `pt-2` 删掉。
- 折叠按钮改成整行：`flex w-full items-center gap-1 px-4 py-2 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#F7F7F6]`，文字「已停用的供应 (N)」不动（有测试在查这几个字）。
- 展开后的列表 `mt-2 space-y-2 pl-2 border-l-2 border-[#E2E2DF]` 改成 `border-t border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60`。

#### C6 「需要你处理」原因、空态、找渠道面板

- 原因块 `pt-1 border-t border-status-danger/20 text-[12px] space-y-1` 改 `pt-1 text-[12px] space-y-1 md:pl-15`：原因文字在桌面上和渠道名左边对齐。它属于这一行，一直显示，不许收起，不许套 `REVEAL_ON_HOVER`。
- 模型没有渠道时的空态 `rounded-xl border border-dashed ... p-6 text-center ...` 改 `px-4 py-3 text-[12px] text-[#78716C]`（不要虚线框，左对齐），文字不动。
- `find-channels-panel.tsx` 最外层 `rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-4 space-y-3` 改 `mx-4 my-2 rounded-xl border border-[#E2E2DF] bg-white p-3 space-y-2`。这个文件别的地方一律不动。

### D. 渠道视角（`channel-pool-view.tsx`）

| 编号 | 现在 | 改成 |
|---|---|---|
| D1 | 左右两栏 `gap-4`；左栏 `rounded-2xl ... p-3 space-y-2 shadow-card`，右栏 `rounded-2xl ... p-5 space-y-5 shadow-card` | 两栏 `gap-3`；左栏 `rounded-xl ... p-2 space-y-1`，右栏 `rounded-xl ... p-4 space-y-3`，两栏都去掉 `shadow-card` |
| D2 | 左侧每条渠道两行：上面名字，下面"接入点 · N 个模型"；`rounded-xl p-3` | **压成一行**：`rounded-md px-2 py-2`。左边一个 `flex items-center gap-2 min-w-0`，放名字（13px，`truncate`）和"接入点 · N 个模型"（12px，`truncate shrink`），右边状态标签不动。选中、悬停的底色照旧 |
| D3 | 右栏详情头部 `border-b ... pb-4`；按钮 `h-8`，删除按钮 `size-8` | 改 `pb-3`；按钮改 `h-7`，删除按钮改 `size-7`、图标 `size-3.5` |
| D4 | "供应模型"列表每行两行字（名称 / 标识）+ 右侧「供应已开启 / 未开启」标签，`p-3` | **压成一行**：`px-3 py-2 flex items-center gap-2 min-w-0`，依次放勾选框、名称（13px，`truncate`）、标识（12px mono `text-[#78716C]`，`truncate`；名称和标识完全相同时不显示标识，写法 `{m.display_name && m.display_name !== m.model_id && (...)}`）。**删掉右侧「供应已开启 / 未开启」标签**，勾选框已经说明了开没开 |
| D5 | "上游提供 N 个模型 / 同步模型"单独一个灰底框，在属性区上面 | 删掉这个框，把它的两样东西搬到"供应模型 (N)"那一行：左边「供应模型 (N)」后面接 12px 的「· 上游提供 N 个模型」，右边放「同步模型」按钮（按钮 className 和 onClick 原样搬）。原来右边那句「勾选开启该渠道对此模型的供应」挪到标题行下面，12px，`text-[#78716C]` |
| D6 | 属性区（渠道名称 / API 地址 / API Key）每行 `p-3` | 每行改 `px-3 py-2`，其余不动 |
| D7 | 供应模型标题与列表之间 `space-y-3` | 改 `space-y-2` |

D5 的 `onOpenSyncModal(...)` 调用整段原样搬，参数一个都不许改。

## 五、最容易出的事故（提前堵住）

1. **排序被顺手"整理"掉**。`useFrozenOrder`、`sortedChannels`、`compareSelectableModels`、`sortSyncGroups` 都是阿禅刚拍板的功能，不是可以清理的旧代码。
2. **把一直显示的东西也藏了**。只有 C4 列出的四样（上下箭头、改名铅笔、测试、删除）平时隐藏。开关和状态标签藏了，阿禅就看不出哪条关着，这次改版就白做了。
3. **用 `hidden` 或 `invisible` 来藏按钮**。只许用透明度（`opacity-0`）。`hidden` 会让按钮从键盘 Tab 顺序里消失，也会让行宽跳动。
4. **找渠道面板被一起收起**。C3 只收渠道列表，找渠道面板在外面。
5. **吸顶失效就去改全局布局**。如果 A2 的 sticky 不生效，原因多半是外层某个容器有 `overflow`。这种情况不许改 `src/app/(app)/layout.tsx` 或任何全局文件，跳过 A2 并在交付清单写明是哪一层挡住的。
6. **手机端被挤坏**。C2 的三列网格只在 `md:` 以上生效。375px 宽度下必须仍能看到渠道名、状态、开关，允许折行。
7. **改到测试在查的字**。`action-buttons.test.tsx` 会在源码里查这些字：「个功能正常」「个在顶班」「个停摆」「条渠道要你处理」「检查一遍」「只查正在用的模型」「接入新渠道」「只看在用」「全部模型」「条渠道供货，」「model.single_supply」「unavailableReasonKey」「disabledChannels」「已停用的供应」，以及 `sort((a, b) => a.sortOrder - b.sortOrder)` 这一整句。这些一个都不许改写。
8. **`tests/compatibility/输入法回车.fixture.tsx` 单独渲染了 `ModelFamilyCard`**。所以模型卡必须能单独渲染，不许改成必须放进 `<table>` 里才能用的 `<tr>` / `<tbody>`。本方案全程用 `div` + 网格，就是为了这一点。

## 六、测量钩子（为了验收能用脚本量，允许加）

给下面这些节点加 `data-slot` 属性。这只是给验收脚本找元素用，不影响样子：

| 节点 | 加什么 |
|---|---|
| 模型卡标题行 | `data-slot="ai-model-header"` |
| 渠道行根节点 | `data-slot="ai-channel-row"` |
| 渠道行里的状态标签那一列 | `data-slot="ai-channel-status"` |
| 渠道视角左侧每条渠道 | `data-slot="ai-key-item"` |
| 渠道视角每条供应模型 | `data-slot="ai-key-model-row"` |
| 顶部状态条 | `data-slot="ai-pool-header"` |
| A1 合并后的筛选行 | `data-slot="ai-pool-toolbar"` |

另外补一处漏网的：`channel-pool-view.tsx` 第 246 行"没有渠道"的空态 `rounded-2xl ... p-12` 改 `rounded-xl ... p-6`，文字不动。

## 七、本地验收（必须做，只许用本地库）

- **禁止连生产库**。`.env.local` 指向生产库，用它启动后在页面上点开关，改的就是线上配置。启动方式只许用：

```bash
set -a; . ./.env.ai-test.local; set +a; npx next dev -p 3236
```

- 演示数据另开终端跑，跑完别关：

```bash
node --import tsx scripts/ai-config-local-demo.ts --run
```

- 打开页面后先在浏览器网络面板确认数据库地址是 `127.0.0.1`，不是就立刻停。登录账号见 `docs/通用管理/测试账号.md`。
- 在模型视角、"全部模型"下，打开浏览器控制台运行下面这段，把输出原样贴回来：

```js
(() => {
  const h = (s) => [...document.querySelectorAll(`[data-slot="${s}"]`)].map((e) => Math.round(e.getBoundingClientRect().height));
  const lefts = [...document.querySelectorAll('[data-slot="ai-channel-status"]')].map((e) => Math.round(e.getBoundingClientRect().left));
  return {
    模型标题行: h("ai-model-header"),
    渠道行: h("ai-channel-row"),
    状态列左边缘去重: [...new Set(lefts)],
    顶部状态条: h("ai-pool-header"),
  };
})()
```

  合格标准：模型标题行全部 ≤ 44；渠道行除了带「需要你处理」原因的那几条，全部 ≤ 40；状态列左边缘去重后**只有 1 个数**（说明所有模型的状态标签对成一条竖线）；顶部状态条 ≤ 48。
- 切到渠道视角，把上面脚本里的两个名字换成 `ai-key-item`（合格 ≤ 40）和 `ai-key-model-row`（合格 ≤ 36）再跑一次，贴输出。
- 截图（每张标编号）：
  1. 模型视角"只看在用"，1440 宽，一整屏。
  2. 模型视角"全部模型"：已停用的模型只剩一行；点开一个能看到它的渠道。
  3. 同一条渠道行：鼠标不在上面时、鼠标移上去时各一张。
  4. 用 Tab 键进入一条渠道行，次要按钮出现。
  5. 往下翻两屏，筛选行仍贴在导航栏下面，没被盖住。
  6. 一条「需要你处理」的渠道，原因一直显示。
  7. 渠道视角一整屏。
  8. 375 宽（手机）下的模型视角和渠道视角。
- 再点一遍这些，确认功能没坏：开关一条供应、上下移一条渠道、改一个渠道名、测试一条供应、为某个模型找渠道、停用再恢复一个模型、渠道视角勾选一个模型、点同步模型。
- 页面控制台不许有报错。

## 八、完成后必须跑的自检（把输出原样贴回来）

动手前先记下起点：

```bash
git rev-parse HEAD
```

改完后：

```bash
cd /Users/mac/Projects/dydata
BASE=<上面记下的起点>
git diff --name-only $BASE
cd "src/app/(app)/admin/ai-config/components"
grep -c "useFrozenOrder(" compute-pool-panel.tsx channel-pool-view.tsx
grep -c "sortSyncGroups(" sync-models-dialog.tsx
grep -c "compareSelectableModels)" model-family-select.tsx
grep -n "sortOrder - b.sortOrder" model-family-card.tsx
grep -nE "shadow-card|rounded-2xl|供应已开启|未开启" compute-pool-panel.tsx compute-pool-header.tsx model-family-card.tsx model-channel-row.tsx channel-pool-view.tsx
grep -nE "\bgroup\b" model-family-card.tsx compute-pool-panel.tsx
grep -nE "\b(hidden|invisible)\b" model-channel-row.tsx
cd /Users/mac/Projects/dydata
npx tsc --noEmit --pretty false
npm run lint
npm run build
AI_GOVERNANCE_TEST_URL=http://127.0.0.1:54321 npx tsx --test --test-concurrency=1 'src/app/(app)/admin/ai-config/'*.test.tsx
npm run gate:design
npm run gate:maintainability
```

预期：
- `git diff --name-only` 只列出第二节铁律 1 的 7 个文件和 `find-channels-panel.tsx`，多一个都要解释。
- `useFrozenOrder(` 计数：`compute-pool-panel.tsx` 是 1，`channel-pool-view.tsx` 是 2。`sortSyncGroups(` 是 1，`compareSelectableModels)` 是 1。`sortOrder - b.sortOrder` 能找到一行。
- 后面三条 grep 没有输出。`\bgroup\b` 那条如果命中变量名（比如 `group.displayName`），贴出来说明即可。
- 其余命令全部通过。

## 九、交付清单

1. 本地提交，提交说明以 `style(ai-config-ui):` 开头。**不许 push**。
2. 按编号（A1 至 D7、第六节）逐项列出：改了哪个文件、改成什么样。
3. 第七节两段测量脚本的原样输出，和 8 张截图。
4. 第八节自检的原样输出。
5. 状态列宽度最后用的是 160 还是 200。
6. **跳过或没做完的项、以及原因，一条都不许隐瞒。**
