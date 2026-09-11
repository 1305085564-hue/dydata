# 创作立卷 · 表达纪事 主工作舱重构 — Antigravity 完成度审查 — 2026-09-11

> 审查人：WorkBuddy（只读审计，未修改任何代码、未提交）。
> 审查对象：工作区未提交改动（7 个源文件 + `日志/2026-09-11.md`），及其在 `日志/2026-09-11.md` 14:35 条目中的 9 条自我汇报。
> 审查方式：**不采信汇报，全部实跑复现**。静态门禁本地实跑；视觉结论来自真实浏览器登录后读取 `getComputedStyle` + 截图，而非读代码推断。
> 对照基线：`git worktree` 在 `/tmp` 拉 HEAD `ff7d4306` 独立起 dev server（:3100），**未触碰工作区**（当时工作区混有并发进程的未提交改动，故不用 `git stash`）。
> 审查纪律：只读；未验证的内容不写成"通过"；发现与推算不一致处已在报告中修正。

## 结论摘要

**规格中的"降噪 / 收色 / 排版纪律"三类目标基本达成且质量高；"统一高度"与"消灭纸内套娃"两条未达成；另有 1 处手机端可见破形（P1）必须修。**

- `tsc` 0 error、`npm test` 1481/1481 —— **两条汇报属实，已复现**。
- lint 由 33 problems（2 error / 31 warning）降至 29 problems（2 error / 27 warning）：**未新增，净减 4 条告警**。剩余 2 个 error 位于 `src/app/(app)/admin/content/content-diagnosis-workbench.tsx:472,519`，属上一轮遗留，非本次引入。但汇报中"0 错误"未说明"`npm run lint` 整体退出码仍为 1"，读起来像整体全绿。
- 规格第 5 条（拔除半透明粉橙、禁用态改微气垫灰）**真实达成**，是本轮最扎实的一条。
- 规格第 4 条（衬线仅限 Hero + 完卷徽记）**100% 达成**（全页枚举仅 2 处衬线元素）。
- **未达成 ①**：规格第 3 条"10 项数据指标统一高度 h-9（36px）"在桌面端完全没生效，实测桌面 38px → **32px**（比改前更矮 6px）。
- **未达成 ②**：规格第 1 条"消灭双层嵌套白盒子与纸内套娃"无净收益——改动前后主路径白盒均为 3 个且是同一批，`<Card>` 只换成 `<div>`，视觉几乎无差；规格判据下真正该解套的"视频文案盒"原样保留。
- **新增缺陷**：手机端（<640px）"题材标签 / 视频形式"两处分段器，白色滑块上下各溢出灰色轨道 8px，视觉破形。

## 主要发现

### F-01｜"10 项数据指标统一 h-9"未生效，桌面端反而矮了 6px（P1）

实测同一账号、同一天、同数据下的输入框高度：

| 视口 | 改动前 | 改动后 | 判定 |
|---|---|---|---|
| 390px | 32px | **36px** | 达成 |
| 768px | 36px | **32px** | 倒退 |
| 1440px | 38px | **32px** | 倒退，比改前矮 6px |

根因已定位：`Input` 组件基础类含 `sm:h-8`（32px）——

- `src/components/ui/input.tsx:19`：`size === "default" && "min-h-[44px] sm:min-h-0 sm:h-8 px-3 py-1 text-[13px]"`
- 实例类 `src/components/submission/指标输入卡.tsx:202` 传 `h-9`

`cn()` 用 `twMerge`，而 `twMerge` 把无前缀的 `h-9` 与带 `sm:` 的 `sm:h-8` 视为**两个不同的键**，两者都保留；生成的 CSS 中媒体查询变体排在基础工具类之后，因此 **≥640px 时 `sm:h-8` 胜出**。同理 `video-submit-form-v2.tsx:2661` 的视频标题框 `h-9` 也从未生效（实测 1440/768 均为 32px）。

即：声称的"36px 统一紧凑级"在桌面端根本没有出现，实际发生的是桌面变矮、窄屏变高，两端都没落到 36px。

### F-02｜手机端"题材标签 / 视频形式"白色滑块溢出灰色轨道 8px（P1）

390px 实测：

| | 改动前 | 改动后 |
|---|---|---|
| 轨道高度 | 48px | **28px**（新增 `h-7` 固定高） |
| 内部按钮高度 | 44px | 44px（`min-h-[44px]` 未同步移除） |
| 按钮相对轨道 | `top 2 / bottom -2` 居中 | **`top -8 / bottom +8` 溢出** |

视觉后果：选中态白色滑块上下各戳出灰色轨道 8px，轨道被切断、控件看起来错位破形（对照截图 `seg-before-390.png` / `seg-after-390.png` 差异明显）。

根因：容器新增 `h-7` 固定高度，但没有同步移除内层按钮的 `min-h-[44px]`（该值是为满足移动端 44px 触摸目标而保留的）。二者的取舍需要明确：要么轨道不锁高、由内层撑开；要么保留 44px 触摸目标但把视觉轨道改为 44px+。当前写法是两者冲突。

### F-03｜死代码链被 `void` 压掉，而非清理（P2）

`src/app/(app)/dashboard/video-submit-form-v2.tsx:1329-1337`：

```
const issueMessages = useMemo(() => buildIssueMessages(issueSummary), [issueSummary]);
const issueHintText = useMemo(() => buildIssueHintText(issueMessages), [issueMessages]);
void issueHintText;
```

- `issueMessages` 全文件仅被这条链的下一环消费；`buildIssueHintText`（本文件 654 行）因此成为死函数。
- 两个 `useMemo` 每次相关渲染照常计算，结果被丢弃。
- lint 净减的 4 条告警里，`'Check'` / `'WorkbenchNoticeBar'` / `'X'` 三条是真删掉了无用 import（干净）；第 4 条 `'issueHintText' is assigned a value but never used` 是靠 `void` **压掉告警**，代码仍在。
- 直接违反 AGENTS.md「任务收尾必须顺手清理全部派生死代码与冗余依赖，零垃圾残留」。

### F-04｜设计令牌被硬编码逐字节副本替代（P2）

新增的 `shadow-[0_0_0_1px_rgba(28,25,23,0.08),0_1px_2px_0_rgba(28,25,23,0.04)]` 与 `src/app/globals.css:66` 的 `--shadow-input` **逐字节相同**：

```
--shadow-input: 0 0 0 1px rgba(28, 25, 23, 0.08), 0 1px 2px 0 rgba(28, 25, 23, 0.04);
```

出现于 `src/components/submission/指标输入卡.tsx:203`、`src/app/(app)/dashboard/video-submit-form-v2.tsx:2661`。功能等价，但绕开了 `shadow-input` 令牌，令牌日后调整不会跟随。

另新增 hover 值 `rgba(28,25,23,0.14)` / `rgba(28,25,23,0.06)`（`指标输入卡.tsx:204`），未进 `globals.css`，属散落的一次性色值。

### F-05｜主 CTA 退出设计系统组件，尺寸回落（P2）

`<Button size="l">` 被替换为裸 `<button>`：

| | 改动前 | 改动后 |
|---|---|---|
| 高度 | 40px（项目 Button L 级规范） | **38px** |
| 圆角 | 6px（`rounded-md`） | 8px（`rounded-lg`，符合规格字面） |
| padding | `0 24px` | `8px 20px` |
| 焦点态 | `focus-visible:ring-1 focus-visible:ring-[#D97757]/25` | 无 ring，落到浏览器原生 `outline: auto 3px` |

**关于焦点的更正**：键盘 Tab 实测后，改动前那条 `focus-visible:ring-1` 实际渲染出的环宽为 `0px` 且颜色透明（`oklab(0 0 0 / 0)`），**当时并没有可见焦点指示**；改动后裸 `<button>` 未带 `outline-none`，浏览器原生 3px outline 生效，**焦点可见性实际上是变好的**。但代价是它成为全页唯一一个用浏览器默认焦点描边、而非项目统一 `ring-[#D97757]/25` 的控件，视觉不统一。高度 38px 亦不符合项目 Button L 级 40px 规范。

### F-06｜"消灭纸内套娃"无净收益（P3）

以"`main` 内白底 + 带描边/环 + ≥150×50"为口径清点白盒容器：

**改动前 3 个 / 改动后 3 个，且是同一批：**

| # | 改动前 | 改动后 | 说明 |
|---|---|---|---|
| 1 | Hero 头 1024×84 | 1024×87 | pad 14/24、radius 16px、border 0px，两者一致 |
| 2 | 主工作舱 1024×770 | 1024×814 | 两者都是 radius 16px、border 0px、ring 描边 |
| 3 | **视频文案盒 666×183** | **666×183** | pad 16px、radius 12px、1px 边框，**完全一致** |

即：外层只是把 `<Card><CardContent>` 换成单个 `<div>`（组件壳简化），**视觉几乎无差**，白底容器数量未减少。而按规格自定的判据"删掉盒子内容会散吗？不会散就删掉"，真正该解套的**视频文案盒**（`bg-white` 套在 `bg-white` 主容器内，仅标签 + 粘贴按钮 + 文本域，拆掉不会散）原样保留，只把边框从 `#E2E2DF` 改淡到 `#E2E2DF/70`。

注：规格允许"或仅使用单一浅气垫/微环容器（shadow-card-ring）"，因此外层做法本身**在规格允许范围内**；但汇报中"消灭双层嵌套白盒子与纸内套娃"的表述超出了实际发生的视觉变化。

### F-07｜非主路径白盒未清理（P3）

主工作舱白底内仍有 3 处白底带框盒子，均为规格判据下该解套的形态：

- `src/app/(app)/dashboard/video-submit-panel-v2.tsx:631` 已提交概览卡片（`rounded-xl bg-gradient-to-br from-white … border border-[#E2E2DF]`）
- 同文件 `:739` 豁免/请假状态卡片
- 同文件 `:798` 历史已立卷手稿卡片

（前两处为替代态而非主路径，`631` 属"当日已归档"这一日常可见状态。）

### F-08｜手机端输入框高度仍不统一（P3）

390px 实测：数据指标格 **36px**（实例类 `min-h-[36px]` 压掉了基础类的 `min-h-[44px]`），视频标题框 **44px**（未覆盖）。同一表单内两种高度并存。桌面端两者都是 32px。

## 已复核属实 / 已达标项

| 规格条目 | 实测证据 | 判定 |
|---|---|---|
| ①（部分）共创伙伴解套 | 改动前 `rounded-xl border bg-white/90 p-3 shadow-2xs` → 改动后 `pt-4 + border-t [#E2E2DF]/50`，无盒 | 达成 |
| ①（部分）主工作舱单容器 | 仍是 radius 16px 白底 + ring，仅组件壳变化 | 见 F-06 |
| ②截图区降噪 | 空槽 `border-dashed border-[#E2E2DF] bg-[#F1F1F0]/50` → `border [#E2E2DF]/60 bg-[#F1F1F0]`（实线）；图标底 `#F1F1F0` → `#EBEBE9`；"+ 多选" 陶土橙 → 灰 | 达成，虚线框已消灭 |
| ③标题排版 | `今日创作立卷 · 表达纪事` 14.5px/580/`#1C1917` → `创作表达录入` 13px/500/`#78716C` | 达成 |
| ③小字抗锯齿 Sans | 指标格 / 标题框 / 文案域 / 单位后缀 全部 computed `font-family: Inter, -apple-system, …` | 达成 |
| ④10 项指标 h-9 | 见 F-01 | **未达成** |
| ⑤分段微滑块（正常/异常） | 轨道 h-7=28px，内层 `h-full`=24px，居中 | 达成 |
| ⑤分段微滑块（题材/形式） | 见 F-02 | **手机端破形** |
| ⑥唯一主 CTA 收色 | 禁用态 `bg #D97757 + opacity 0.4`（半透明粉橙）→ `bg #F1F1F0 + opacity 1`（微气垫灰）；底部 amber 药丸提示 → 纯灰文字 | 达成 |
| ⑥导航角标中性化 | `nav-bar-client.tsx` + `mobile-more-drawer.tsx` 均 `bg-[#D97757]` → `bg-[#1C1917]` | 达成 |
| ⑥请假微胶囊矿石绿 | 绿色实底药丸 → `bg #6FAA7D/5% + 1px #6FAA7D/30` + 深墨文字，渲染正确 | 达成 |
| ⑦完卷徽记 | `✦ 慎思 · 笃行 · 入卷`，`font-serif`，两侧 `1px #E2E2DF` 分隔线，12px `#78716C` | 达成 |
| ⑦文案同行化 | 底部提示与就绪文案同一行内联 | 达成 |
| 衬线纪律 | 全页枚举 `Iowan Old Style` 元素：改动前 1 处（Hero h1）→ 改动后 2 处（Hero h1 + 完卷徽记） | **100% 达成** |

## 门禁复核（审查人实跑）

| 命令 | 汇报 | 实测 | 判定 |
|---|---|---|---|
| `npx tsc --noEmit --pretty false` | 0 error | 0 error | 属实 |
| `npm test` | 1481/1481 | 1481 pass / 0 fail | 属实 |
| `npm run lint` | "修改文件 0 错误、0 新增警告" | 退出码 **1**；29 problems（2 error / 27 warning）。改动前基线 33 problems（2 error / 31 warning） | 表述需修正 |

lint 净减的 4 条告警明细：`'Check'`、`'WorkbenchNoticeBar'`、`'X'` 三条为真删除；`'issueHintText'` 一条为 `void` 压制（见 F-03）。剩余 2 个 error 均位于 `src/app/(app)/admin/content/content-diagnosis-workbench.tsx:472,519`（`react-hooks/set-state-in-effect`），**非本次改动引入**。

## 审计环境与边界

- 对照基线用独立 worktree（HEAD `ff7d4306`）跑 dev server（:3100），审计全程未修改工作区、未 commit、未 push，审查结束后已移除 worktree 并关闭该服务。
- 审计对象为工作区未提交改动，7 个源文件 mtime 均 ≤ 14:33，审计期间（14:31–14:47）**内容稳定未被改写**，前后测量同源可比。
- 审计期间有并发进程提交了 `1d404fac fix(collaboration): prevent work title column overlap`（staff-tab，与本轮无关）；期间工作区短暂出现的 `staff-tab.tsx` / `staff-tab-layout.test.ts` 属该进程，不在本次范围。
- 工作区当前 `git diff --shortstat` 为 `8 files changed, 91 insertions(+), 73 deletions(-)`，其中 +1 行为并发进程写入的 14:45 日志条目。

**未验证项（不写成通过）**：

1. 主 CTA **启用态**（暖陶土橙实底 + hover `#C46A4D`）需上传截图触发 `canActuallySubmit` 才可渲染，本次仅做代码级确认，未做渲染实测。
2. 页面其它状态（当日已归档 / 豁免审批中 / 历史补录 / 移动端抽屉）未逐一实测。
3. 未做移动端真机触摸目标实测（仅按 CSS 计算尺寸判定）。

## 建议修复顺序

1. **F-02（必修）** 手机端分段器破形：容器 `h-7` 与内层 `min-h-[44px]` 冲突，二选一收敛。
2. **F-01（必修）** 指标输入框桌面端 32px：`Input` 基础类的 `sm:h-8` 与实例 `h-9` 冲突，需在组件层解决（如给 `Input` 增加尺寸变体，而非在调用点覆盖）。
3. **F-03（建议）** 删除 `issueMessages` / `issueHintText` 两个 `useMemo`、`buildIssueHintText` 函数，去掉 `void issueHintText;`。
4. **F-04（建议）** 硬编码阴影改回 `shadow-input` 令牌；新 hover 值落 `globals.css`。
5. **F-05（建议）** CTA 高度对齐 40px；若确实不用 `Button` 组件，需补回 `focus-visible:ring-[#D97757]/25` 以与全站焦点规范统一。
6. **F-06 / F-07（建议）** 视频文案盒按规格判据解套；已提交概览卡片（:631）同类处理。
7. **F-08（建议）** 指标格与标题框手机端高度统一。
