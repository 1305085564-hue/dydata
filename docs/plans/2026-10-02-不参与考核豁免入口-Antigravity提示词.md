# 交给 Antigravity 的施工提示词：不参与考核入口

你负责本任务的前端部分。请先读取：

- AGENTS.md
- docs/Claude设计哲学.md
- docs/Claude设计规范.md
- docs/plans/2026-10-02-不参与考核豁免入口-执行计划.md

## 目标

在现有成员管理的真实成员详情/编辑弹窗中，增加 Owner 专属的“不参与考核”开关。复用已有成员数据中的 exempt_type === "permanent" 状态，不新增字段，不改后端权限、RPC、migration 或应交口径。

已确认产品口径：

- company_owner 才能看到和操作。
- Owner 直接设置，点击后永久生效。
- 只影响应交/缺交类视图；历史记录仍可查。
- 永久优先于临时豁免。
- 撤销仍仅 Owner。
- 入口复用成员弹窗，不做独立管理页和批量操作。

## 后端接口契约

Codex 会提供以下接口；如果接口尚未存在，先用 mock/类型边界完成前端，再明确列出阻塞，不要自行修改服务端：

- POST /api/exemptions/permanent
  - body: { user_id: string, reason: string }
  - success: 2xx，返回当前成员 permanent 状态或 { data: ... }
  - failure: 401/403/409/422/500，读取 { error: string }
- DELETE /api/exemptions/permanent
  - body: { user_id: string }
  - success: 2xx
  - failure: 同上

## 交互要求

- Owner 在成员详情中看到清晰的“不参与考核”状态和开关。
- 已 permanent 时显示“已设置不参与考核”，提供显眼的“撤销”操作。
- 开启前要求填写原因并二次确认，明确“设置后不再进入应交/缺交统计”。
- 撤销前二次确认，说明历史数据不会删除。
- 请求进行中禁用重复点击；失败保留当前状态并展示后端错误；成功后刷新成员数据和当前弹窗。
- Admin 和普通成员不渲染该控件；不能只依赖前端隐藏，服务端 403 由后端保证。
- 保持现有弹窗布局、响应式和无障碍习惯；不要新造独立视觉体系。
- 不把临时豁免误显示为“不参与考核”；temporary 仍走原流程。

## 实施边界

- 先通过 rg 确认真实挂载链和数据来源，再改最小文件。
- 不修改 supabase/migrations/**、src/app/api/**、src/lib/exemption-review.ts、应交统计 loader。
- 不顺手重构成员管理或豁免流程。
- 为状态分支补最小定向组件/逻辑测试：Owner 可见、Admin 不见、permanent 显示已设置、temporary 不误判、失败可恢复。
- 完成后报告实际修改文件、测试命令和未覆盖边界；不要声称已完成后端或真实生产验收。
