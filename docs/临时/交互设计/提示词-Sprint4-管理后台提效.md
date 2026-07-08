# 提示词：Sprint 4 — 管理后台提效

## 你的身份
你是 DYData（抖音数据日报平台）的资深前端开发工程师，精通 React + TypeScript + Next.js + Tailwind CSS。

## 任务背景
管理后台是管理员每天使用的核心工具，但存在效率瓶颈：违规复核必须一次性完成无暂存、审批后无法撤销、驳回原因每次手动输入、权限变更后成员无感知。

## 任务清单（按顺序执行）

### 任务 1：违规复核增加「暂存」功能

**目标**：管理员可以分多次完成复核，不必一次性填完。

**文件**：`src/app/(app)/admin/conversion-hub/tabs/violations-tab.tsx`

**要求**：
1. 每个复核卡片增加「暂存」按钮（次要按钮样式）
2. 暂存数据存储到 localStorage，key：`dydata.draft.review.{caseId}`
3. 暂存内容包括：风险等级、管理员结论、建议操作
4. 页面加载时，检查每个卡片是否有暂存草稿，有则显示「恢复草稿」按钮
5. 提交最终复核（确认/驳回）后，清除该 case 的暂存
6. 暂存数据带时间戳，显示「上次暂存于 14:32」

**验收标准**：
- 填写一半点击「暂存」，刷新后显示「恢复草稿」
- 恢复后数据正确填充
- 提交后暂存清除
- 多个 case 的暂存互不干扰

---

### 任务 2：增加「撤销」操作（审批、删除）

**目标**：误操作后 5 秒内可以撤销。

**文件**：
- `src/app/(app)/admin/join-request-review-list.tsx`
- `src/app/(app)/admin/modules/permission-manager.tsx`（如有删除成员操作）

**要求**：
1. 定义通用 hook：新建 `src/hooks/use-undo-action.ts`
   ```typescript
   function useUndoAction<T>(options: {
     onExecute: (item: T) => Promise<void>;
     onUndo: (item: T) => Promise<void>;
     undoDuration?: number; // 默认 5000ms
   }): {
     execute: (item: T) => void;
     undoItem: T | null;
     undoCountdown: number; // 剩余秒数
     performUndo: () => void;
   };
   ```
2. 入队审批：同意/拒绝后，toast 显示「已同意，5 秒内可撤销」，带「撤销」按钮
3. 点击撤销：恢复该行为待审批状态，调用 API 回滚
4. 倒计时结束后，undo 入口消失，操作正式生效
5. 权限管理中的删除成员同样支持撤销

**验收标准**：
- 同意入队后 toast 显示倒计时和撤销按钮
- 5 秒内点击撤销，行恢复为待审批
- 5 秒后撤销入口消失
- 网络错误时撤销失败，toast 提示

---

### 任务 3：驳回时增加模板原因

**目标**：减少管理员重复输入常用驳回原因。

**文件**：`src/app/(app)/admin/conversion-hub/tabs/violations-tab.tsx`

**要求**：
1. 定义常用驳回原因列表：
   ```typescript
   const REJECT_TEMPLATES = [
     { id: "incomplete", label: "资料不全", text: "提交的资料不完整，请补充后重新提交" },
     { id: "unclear", label: "证据不清晰", text: "截图/证据不清晰，请重新上传" },
     { id: "wrong_category", label: "分类错误", text: "案例分类选择错误，请核对后重新提交" },
     { id: "duplicate", label: "重复提交", text: "该案例已存在，请勿重复提交" },
     { id: "other", label: "其他原因", text: "" },
   ];
   ```
2. 驳回时，先显示模板选择下拉框
3. 选择模板后自动填充到原因文本框，可继续编辑
4. 选择「其他原因」时，文本框为空，需手动输入
5. 管理员也可以不选模板，直接手动输入

**验收标准**：
- 驳回时显示模板选择
- 选择后自动填充，可编辑
- 提交时发送最终文本

---

### 任务 4：权限变更后增加「已生效」提示

**目标**：管理员知道权限变更什么时候真正生效。

**文件**：`src/app/(app)/admin/modules/permission-manager.tsx`

**要求**：
1. 权限保存成功后，toast 从「已更新」改为「权限已保存，成员下次刷新页面后生效」
2. 如果实现 WebSocket/SSE 推送（可选加分项），可改为「权限已实时推送」
3. 在权限编辑 Sheet 底部增加小字提示：「* 权限变更将在成员下次访问页面时生效」

**验收标准**：
- 保存后提示文案清晰
- 管理员知道成员需要刷新才能看到变更

---

## 关键约束

1. **不要修改 .env 文件**
2. **不要修改数据库 migration**
3. **所有改动必须保持 TypeScript 类型正确**
4. **使用项目现有设计令牌和组件**
5. **改完后运行 `npm run build` 确认无编译错误**

## 自测 checklist

- [ ] 违规复核暂存/恢复正常
- [ ] 入队审批撤销 5 秒倒计时正常
- [ ] 驳回模板选择正常
- [ ] 权限保存提示文案正确
- [ ] `npm run build` 无错误

## 输出要求

完成后，返回以下信息：
1. 每个任务的修改文件列表
2. 遇到的任何问题及解决方案
3. 是否需要我（复核者）特别关注的地方
