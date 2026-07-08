# 提示词：Sprint 4 补充 — 撤销操作接入业务组件

## 你的身份
你是 DYData（抖音数据日报平台）的资深前端开发工程师，精通 React + TypeScript + Next.js。

## 任务背景
Sprint 4 任务 2 的 `useUndoAction` hook 已创建完成，但**未接入任何业务组件**。需要将其接入入队审批的「单条同意/驳回」操作，实现 5 秒倒计时撤销功能。

## 已完成的 hook（不要修改）

文件：`src/hooks/use-undo-action.ts`

```typescript
interface UseUndoActionResult<T> {
  execute: (item: T) => void;      // 启动撤销流程
  undoItem: T | null;              // 当前待撤销的项
  undoCountdown: number;           // 剩余秒数
  performUndo: () => void;         // 执行撤销
}
```

**使用模式**：
```typescript
const { execute, undoItem, undoCountdown, performUndo } = useUndoAction<RowType>({
  onExecute: async (item) => {
    // 倒计时结束后真正执行的操作
    await apiCall(item.id);
  },
  onUndo: async (item) => {
    // 用户点击撤销后恢复的操作
    // 通常只需恢复 UI 状态
  },
  undoDuration: 5000,
});
```

## 任务清单

### 任务：将 useUndoAction 接入 join-request-review-list.tsx

**目标**：单条同意/驳回后，5 秒内可撤销。

**文件**：`src/app/(app)/admin/join-request-review-list.tsx`

**当前问题**：
- `handleApprove` 和 `handleReject` 立即调用 server action，无延迟
- 无撤销 UI（倒计时条、撤销按钮）

**要求**：

#### 1. 单条同意接入撤销

```
用户点击「同意」→ execute(approvedRow)
                      ↓
              行立即从列表消失
              显示撤销提示条（见下方 UI 规范）
                      ↓
              5秒内点击「撤销」→ performUndo()
                                    ↓
                              行恢复到列表
                              不调用 approveJoinRequestAction
                      ↓
              5秒倒计时结束 → onExecute 调用 approveJoinRequestAction
```

#### 2. 单条驳回接入撤销

同上逻辑，但调用 `rejectJoinRequestAction`。

#### 3. 撤销提示条 UI 规范

在列表顶部（或底部固定）显示：

```tsx
{undoItem && (
  <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#D99E55]/30 bg-[#D99E55]/10 px-4 py-2.5">
    <span className="text-[13px] text-zinc-700">
      已同意 <span className="font-medium">{undoItem.userName || undoItem.email}</span> 的入队申请
    </span>
    <span className="ml-auto text-[13px] font-medium text-[#D97757]">
      {undoCountdown}秒后可撤销
    </span>
    <Button
      size="sm"
      variant="outline"
      onClick={performUndo}
      className="h-7 border-[#D97757] text-[#D97757] text-[12px] hover:bg-[#D97757]/5"
    >
      撤销
    </Button>
  </div>
)}
```

**驳回时的文案**：「已驳回 ... 的入队申请」

#### 4. 撤销后的状态恢复

`onUndo` 中需要：
- 将行恢复到 `visibleRows`（保持原有排序）
- 如果该行在 `selectedIds` 中，保持选中状态

#### 5. 批量操作暂不做撤销

批量同意/驳回保持现有立即提交逻辑，本次只改单条操作。

#### 6. 边界情况

- 用户正在撤销倒计时中，又点击另一条同意 → 前一条应立即提交（调用 onExecute），新一条开始倒计时
- 用户刷新页面 → 未提交的撤销操作丢失（可接受）
- 网络错误（onExecute 失败）→ 显示 toast 错误，行不恢复（因为已经正式提交了）

## 关键约束

1. **不要修改 `use-undo-action.ts`** — hook 已完成，只接入使用
2. **不要修改批量操作逻辑** — 批量保持现有立即提交
3. **保持 TypeScript 类型正确**
4. **使用项目现有组件**（Button、feedbackToast 等）
5. **改完后运行 `npm run build` 确认无编译错误**

## 自测 checklist

- [ ] 点击「同意」→ 行消失 → 显示撤销条 + 倒计时
- [ ] 5 秒内点击「撤销」→ 行恢复 → 不调用 API
- [ ] 5 秒倒计时结束 → 调用 approve API
- [ ] 倒计时中进行新的同意操作 → 前一条立即提交
- [ ] 驳回操作同上
- [ ] `npm run build` 无错误

## 输出要求

完成后返回：
1. 修改的文件列表
2. 遇到的任何问题
3. 是否需要我（复核者）特别关注的地方
