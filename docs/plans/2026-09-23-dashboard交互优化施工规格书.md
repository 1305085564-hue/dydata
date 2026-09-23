# 数据上传工作台交互优化 · Antigravity 施工规格书

> 日期：2026-09-23 · 整合来源：三份走查报告（交互规范走查 / a11y 巡检 / Norman 深度走查）+ 代码查证
> 分工：本文档为唯一施工依据。阿禅已拍板全部 7 项；业务争议项（互动二次确认）已定"提交前二次确认"。

---

## 执行纪律（先读，违反即返工）

- 不理解需求，先问，禁止按猜测施工；不优化、不加创意、不顺手重构无关代码
- 照抄规格：UI 像素级、逻辑照搬；只允许补类型、调命名、写必要注释
- 禁碰清单里的文件一个字节都不许动
- 交付前逐条对照第五节验收清单自查，附自查结果

---

## 一、文件清单

### 可改（按改动项标注）

| 文件 | 承担项 |
|---|---|
| `src/app/(app)/dashboard/video-submit-form-v2.tsx` | F1 聚焦调用、F4 快捷键提示、F5 数据承接、F7 二次确认主体 |
| `src/components/submission/指标分组区.tsx` | F1 暴露 `focusMetric`、F5 视觉透传、F7 公式源头 |
| `src/components/submission/指标输入卡.tsx` | F5 低置信度视觉标记 |
| `src/components/submission/填报表单状态.ts` | F1 `summarizeSubmissionIssues` 扩展、F5 字段类型扩展 |
| `src/app/(app)/dashboard/video-submit-form-model.ts` | F5 `EditableMetricField` 类型 |
| `src/app/(app)/dashboard/video-submit-form-state.ts` | F5 状态类型同步 |
| `src/app/(app)/dashboard/video-submit-panel-v2.tsx` | F3 日期按钮 aria-label、F6 补交徽章 |
| `src/components/submission/截图槽位区.tsx` | F2 粘贴提示行 |

### 新建

无。

### 禁碰（含原因）

- `src/app/api/ocr-screenshot/`：后端置信度契约已完备，只消费不修改
- `src/app/api/video-submit/`：提交接口零改动
- `src/hooks/use-form-draft.ts`：草稿机制健康（1 秒防抖），不动
- `src/app/(app)/dashboard/redesign/exemption-dialog-v2.tsx`：豁免文案已合规，不动
- `src/components/submission/提交状态机.ts`、`提交状态机.test.ts`：不动
- 禁止任何 migration / RLS / 权限相关改动

---

## 二、七项改动规格

### F1 校验失败 → 字段级聚焦（P0）

**现状**：`handleSubmit`（video-submit-form-v2.tsx:1611-1667）校验失败时 `triggerFormShake()` + `scrollToIssueAnchor(issueSummary.firstIssueAnchor)`，只滚到区块（slots/metrics/topicTag/meta），不落到具体字段。

**施工**：

1. `填报表单状态.ts` 的 `summarizeSubmissionIssues`：返回对象新增 `firstInvalidFieldKey`。取值范围：`EditableMetricKey`（11 项指标之一）或 `"videoTitle" | "content" | "topicTag"`，无明确字段时 `null`。判定优先级与该函数现有 issue 排序一致：先截图槽（null）→ 再指标缺项（第一个缺的 key）→ 再 meta（videoTitle/content）→ 再 topicTag。
2. `指标分组区.tsx`：用 `useImperativeHandle` 暴露 `focusMetric(key: EditableMetricKey): void`，内部即现有 `inputRefs.current[key]?.focus()`（inputRefs 已在该文件 68 行）。组件外层包 `forwardRef`，**不破坏现有 props**。
3. `video-submit-form-v2.tsx` 的 handleSubmit：
   - 1632-1635 分支：保留 `scrollToIssueAnchor`，在其后追加——若 `firstInvalidFieldKey` 为指标 key，调 `metricsSectionRef` 换成指标分组区实例的 `focusMetric(key)`（需要给 `<指标分组区>` 挂 `ref`，命名 `metricsGroupRef`）；若为 `"videoTitle" | "content"`，聚焦对应已有输入框（若无 ref 则补 `metaVideoTitleRef` / `metaContentRef`，照 inputRefs 模式）；若为 `"topicTag"` 或 null，维持现状仅滚动。
   - 1638-1642（topicTag 分支）、1644-1647（导粉无文案分支）：同样补聚焦——topicTag 聚焦话题下拉触发按钮；导粉无文案聚焦文案输入框。
4. 聚焦成功后给被聚焦元素加一次性高亮：聚焦时加 ring class，1.5s 后移除（`setTimeout` 1500ms，组件卸载时清理 timer）。

**视觉规格（高亮）**

- 追加 class：`ring-2 ring-[#D97757]/60 ring-offset-1`，1.5s 后还原
- 不得改输入框常态样式

**边界**

- `firstInvalidFieldKey === null`（截图槽类问题）：行为与现状完全一致，只滚区块
- 新建 / 补交（backfill）/ 编辑今日（editToday）三模式全部生效，禁止按 mode 分支差异处理
- `hasAttemptedSubmit` 触发的行内错误提示逻辑（2443-2536 现有）不受影响

---

### F2 截图槽位粘贴意符（P0）

**施工**：`截图槽位区.tsx`，槽位网格容器下方加一行：

```
支持直接 ⌘/Ctrl+V 粘贴截图
```

**视觉规格**

- class：`mt-2 text-center text-[11px] sm:text-[12px] text-[#A8A29E]`
- 与上方槽位网格间距 `mt-2`（8px），不得加粗、不得加图标
- 响应式：三档（默认 / sm / lg）仅字号变化，默认 11px、sm 起 12px，布局不变

**边界**：anomalyStatus 开启、槽位数变化（单槽/双槽）时该行始终显示。

---

### F3 日期按钮读屏标签（P2，顺手项）

**施工**：`video-submit-panel-v2.tsx:548`，`aria-label="切换填报日期"` 改为动态：

```tsx
aria-label={`切换填报日期：${按钮上显示的日期文本}`}
```

**硬性要求**：日期文本必须与按钮可见文本**同源**（从渲染按钮内容的同一个变量取），禁止自己拼 `YYYY-MM-DD` 格式。若按钮文本来自格式化函数，就把该函数的输出同时喂给 aria-label。

**边界**：日期随切换变化时 aria-label 同步变化，DevTools 无障碍树可见。

---

### F4 快捷键提示常驻（P2，顺手项）

**施工**：`video-submit-form-v2.tsx` 2742 行"已自动保存 HH:MM"同一容器内（其后追加，不换行结构）：

```
 · ⌘/Ctrl+Enter 提交
```

**视觉规格**

- 与"已自动保存"完全同字号、同色、同字重；中间用 ` · ` 分隔（空格+中点+空格）
- 该容器现有 class 不动，只加内容
- 响应式：容器在窄屏若折行属正常，不得为此改布局

**边界**：`lastSavedAt` 为 null（尚未保存过）时，"已自动保存"不显示，此时快捷键提示**仍须显示**（它不该依赖保存状态）。若现有结构做不到，把快捷键提示挪到保存提示的父级容器内并列放置。

---

### F5 OCR 低置信度字段标记（P1）

**数据链路（先查证后施工）**：

1. 后端契约已返回字段级置信度：`ocr-contract.ts` 的 `confidence: Record<OcrFieldKey, ConfidenceLevel>`，`ConfidenceLevel = "high" | "medium" | "low"`，且槽位总分 <0.7 时 `slot_status = "pending_confirm"`。
2. **施工第一步**：确认前端 OCR 回填后 per-field confidence 是否保留。查 `video-submit-form-model.ts` 的 OCR 回填路径与 `EditableMetricField` 类型。
   - **若已保留**：直接用。
   - **若被丢弃**：给 `EditableMetricField` 增加 `confidenceLevel: "high" | "medium" | "low" | null` 字段；OCR 回填时从响应 `confidence[key]` 写入；**用户手工编辑该字段时置 null**（在各字段 onChange 的 `markManualEdit` 链路一并处理，禁止新增独立副作用）；编辑详情回填（editDetail）置 null。
3. 数据流：form state → `指标分组区`（新增 prop `confidenceLevels?: Partial<Record<EditableMetricKey, ConfidenceLevel>>`）→ `指标输入卡`（新增 prop `confidenceLevel?: ConfidenceLevel | null`）。

**视觉规格（指标输入卡）**

- 仅当 `confidenceLevel === "low"` 时渲染：输入框右上角（相对输入框容器 `relative`）绝对定位圆点
- class：`absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-[#B98A54]`（尺寸、圆角规格照抄 exemption-dialog-v2.tsx:521 的圆点）
- hover 该输入框时的气泡提示：复用项目现有 hover 提示方案；若无现成组件则退化为 `title` 属性，文案 `OCR 置信度较低，建议重点核对`
- `"medium"` / `"high"` / `null` **一律不渲染任何标记**（避免满屏噪点）
- 不改输入框本身的任何样式

**边界**

- 手工编辑后标记立即消失（confidenceLevel 已置 null）
- 二次 OCR 覆盖该字段时标记按新置信度刷新
- 编辑今日 / 补交模式（dataSource 非 OCR）无任何标记
- 禁止改动"待核对"槽位级现有黄标（`slot_status = pending_confirm` 的 UI 是另一个机制，属于槽位不属于字段）

---

### F6 补交模式徽章（P1）

**施工**：`video-submit-panel-v2.tsx`，表单顶部表头区域（与账号/日期信息同一视觉带）。条件：`mode === "backfill"`（form 内已有 `isBackfillMode`，752 行；若 mode 状态在 form 层，通过现有 props 下沉或在该文件内自取，禁止新造状态源）。

**视觉规格**

- 胶囊形徽章，文案：`正在补交历史数据`
- class 基调：`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] sm:text-[12px]`
- 配色：边框 `border-[#D97757]/30`，底色 `bg-[#D97757]/10`，文字 `text-[#D97757]`，圆点（文字左侧）`h-1.5 w-1.5 rounded-full bg-[#D97757]`
- **优先复用**：若 `WorkbenchNoticeCapsule` 或其样式 token 可直接复用，以其 token 为准，不要新造色值
- 位置：表头带内、日期信息附近；与周围元素间距照抄表头现有节奏（gap 一致）

**边界**：新建、编辑今日模式不渲染；mode 切换（新建 ↔ 补交）时徽章出现/消失无动画要求。

---

### F7 互动总和 > 播放量 → 提交前二次确认（P1，阿禅已拍板）

**现状**：`指标分组区.tsx:107-113` 仅算 `showInteractionWarning` 显示一行琥珀字，不阻断不确认。

**施工**：

1. **公式唯一化**：把该判定公式提到 `填报表单状态.ts`（或 video-submit-form-model.ts，与现有 metric 纯函数同处）导出纯函数：

```ts
export function isInteractionExceedingPlayCount(fields: {
  play_count: string | number | null;
  likes: string | number | null;
  comments: string | number | null;
  shares: string | number | null;
  favorites: string | number | null;
}): { exceeded: boolean; interactions: number; playCount: number };
```

`指标分组区` 的 `showInteractionWarning` 改为调用它（**禁止两处公式并存**，防漂移）。

2. `video-submit-form-v2.tsx`：
   - 新增状态 `const [interactionConfirm, setInteractionConfirm] = useState<{ open: boolean; interactions: number; playCount: number }>({ open: false, interactions: 0, playCount: 0 })`
   - handleSubmit 内插入位置：**editToday 详情校验（1663-1667）之后、真正提交 API 之前**（约 1668 行后）。逻辑：

```ts
const interactionCheck = isInteractionExceedingPlayCount({
  play_count: fields.play_count?.value ?? null,
  likes: fields.likes?.value ?? null,
  comments: fields.comments?.value ?? null,
  shares: fields.shares?.value ?? null,
  favorites: fields.favorites?.value ?? null,
});
if (interactionCheck.exceeded) {
  setInteractionConfirm({ open: true, ...interactionCheck });
  return;
}
```

   - 确认回调：关闭弹窗并**继续提交流程**。施工方式：把 handleSubmit 后半段（组装 payload + 提交 API）抽为 `executeSubmit()`，handleSubmit 校验全过后若需确认则挂起，ConfirmDialog onConfirm 调 `executeSubmit()`。**禁止**用"跳过校验"的 flag hack。
   - UI：复用 `src/components/ui/confirm-dialog.tsx` 的 `ConfirmDialog`（用法参考 member-drawer.tsx:646）。
     - 标题：`互动数据异常确认`
     - 描述：`点赞+评论+转发+收藏总和（{interactions}）超过了播放量（{playCount}），请核对是否存在识别错误。确认无误后继续提交？`
     - 按钮：取消 / 确认提交
   - **「作品异常」（anomalyStatus）开启时同样触发，不做豁免**。

**边界**

- 取消后不提交、表单数据原样保留、不触发 shake
- 二次确认只拦一次：确认后本次提交直接放行，弹窗状态复位
- play_count 为空或 0 时不触发（公式内已有 `playCount > 0` 前提）
- 新建 / 补交 / 编辑今日三模式一致生效
- 键盘：`Enter` 在弹窗内默认触发"确认提交"需确认符合 ConfirmDialog 现有行为，不自作主张改

---

## 三、验收标准（交付前逐条自查并附结果）

### 功能测试

1. **F1**：漏填第三排某指标 → 提交 → 滚到指标区**且焦点直接落入那个输入框**、高亮环 1.5s 后消失；漏填话题标签 → 焦点落在话题下拉；漏填标题 → 焦点落在标题框；三模式（新建/补交/编辑今日）各验一次
2. **F1 反向**：截图槽缺图 → 行为与改前一致（只滚区块，无字段聚焦）
3. **F2**：槽位下方可见提示行；双槽/单槽、作品异常开/关均在
4. **F3**：DevTools Accessibility 面板查看日期按钮，accessible name 含"切换填报日期"及当前日期文本；切换日期后同步变化
5. **F4**：快捷键提示与"已自动保存"同排；未保存过（lastSavedAt null）时快捷键提示仍在
6. **F5**：mock OCR 响应带 `confidence: { likes: "low" }` → 点赞框出现琥珀点，其余字段无；编辑点赞框后点立即消失；`medium`/`high` 字段永不出现点；编辑今日模式无任何点
7. **F6**：进入历史日期补交 → 徽章出现；回新建 → 消失
8. **F7**：造 点赞+评论+转发+收藏 > 播放量 → 提交 → 弹确认 → 点取消 → 未提交、数据保留、无 shake → 再提交 → 确认 → 真正提交成功；正常数据不弹；作品异常开启时同样弹

### 视觉走查

9. F2/F4/F5/F6 各元素 class 与规格字符串级一致（色值 #A8A29E / #B98A54 / #D97757 不得漂移）
10. 三档视口（375 / 768 / 1280）截图比对，无错位、无溢出、无折行异常

### 边界 case

11. F5：二次 OCR 后置信度从 low 变 high，标记正确消失
12. F7：取消确认后修改数据使公式不成立，再提交不弹窗
13. F1：连续快速双击提交按钮，聚焦逻辑不重复叠加 timer

### 代码检查

14. `npx tsc --noEmit` 通过
15. `npm run gate:static` 退出码 0
16. `npm test` 全绿；新增/修改的测试断言验证**行为**（聚焦、置 null、弹窗状态），禁止源代码字符串匹配式假断言
17. `git diff` 中禁碰清单文件零改动

---

## 四、参考与约束

- 项目设计基调：docs/Claude设计哲学.md + docs/Claude设计规范.md（动手前必读，冲突时哲学优先）
- 现成可复用：`ConfirmDialog`（components/ui/confirm-dialog.tsx）、`feedbackToast`（components/ui/feedback-toast）、圆点规格（exemption-dialog-v2.tsx:521）、色板（#D97757 / #B98A54 / #A8A29E / #E2E2DF / #292524）
- 只读参考：ocr-contract.ts（置信度契约）、use-form-draft.ts（草稿，仅看不改）、指标分组区.tsx:68-105（inputRefs 与 Enter 流转）
- 禁用方案：禁止 `window.confirm` / 原生 `alert`；禁止新造色板；禁止动后端契约；禁止给改动项加进入/退出动画（F1 高亮、F6 徽章均即时显隐）
