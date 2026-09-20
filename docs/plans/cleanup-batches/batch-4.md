---
批次 4: 死集群（须产品确认后执行）
优先级: P2
预估工时: 4h
前置依赖: ~~NU-1（A-11）~~ **2026-09-19 阿禅已拍板：A-11 删、A-10 删、A-13 删（旧"推荐"代码不保留，未来按 V3 新架构重做）**——产品签字已收齐，前端 owner 降为知会；仅剩：后端确认豁免列迁移全部落地（A-12，与 BLK-4 直接相关）；A-14 已修正为"不删"（见 README 修正 1）
---

> 本批全是"集群级"删除（多文件闭合子图 / 整文件），§7 的 readFileSync 源码断言测试是本批最大脆断源，每个清理项都列了配套测试。

## 清理清单

- [x] A-10: 旧版 AI 改写配置面板整文件死（`src/app/(app)/admin/ai-config/components/rewrite-client.tsx`，501 行，默认导出 `RewriteClient` 在 :199）
  - 执行记录 2026-09-19: 整文件删 + `ai-config-shell.tsx` 类型去 `"rewrite"`、:40 兜底删（深链 `?tab=rewrite` 经 `normalizeTab` 归入 bindings，行为不变）+ `page.tsx` normalizeTab 去 rewrite 分支 + `a11y-responsive-integration.test.ts` 两处 rewrite 断言块删。
  - 引用证明: `rg -lN "\bRewriteClient\b|rewrite-client" src scripts tests` → 仅自身 + `src/lib/a11y-responsive-integration.test.ts`（:13 清单、:34 readSource）。`ai-config-shell.tsx` 的 dynamic 注册只有 models(:17)/bindings(:21)/providers(:25)，**无 rewrite**；tab 类型残留 `"rewrite"`（:9）与 `initialTab === "rewrite" ? "bindings"` 兜底（:40）。
  - 删除范围: 整文件删 + `ai-config-shell.tsx` 清理 `"rewrite"` 联合成员（:9）与 :40 兜底映射（改由产品确认深链 `?tab=rewrite` 的历史入口是否还需兜底，保守可只删类型保留运行时兜底）。
  - 测试耦合: `a11y-responsive-integration.test.ts:13,:34` 及其 rewrite 断言块。
  - 验证命令: `rg -n "rewrite-client|RewriteClient" src -g '!*.test.ts*'`（空）+ `npm test`。
  - 确认人: 产品（旧改写 UI 正式下线）→ **已于 2026-09-19 拍板"删"**。
- [x] A-11: dashboard 豁免死集群（3 文件 ≈655 行）
  - 执行记录 2026-09-19: 三文件 + `dashboard-workspace-header.test.tsx` 整删；`dialog-layout.test.ts` 旧弹窗断言删（保留 v2 断言）、`dashboard-humanistic-copy.test.ts` exemptionSource 重定向到 `redesign/exemption-dialog-v2.tsx`（v2 具备全部断言素材：标题文案在、无禁色、无 serif）、`a11y-responsive-integration.test.ts` :242-246 header/quick-button 断言删（:247 截图槽位区与 Topics/Rewrite 块保留）。
  - 路径: `src/app/(app)/dashboard/components/dashboard-workspace-header.tsx`（186 行，`DashboardWorkspaceHeader` :25）、`.../components/quick-exemption-button.tsx`（57 行，`QuickExemptionButton` :19）、`src/app/(app)/dashboard/申请豁免弹窗.tsx`（412 行，`ExemptionModal` :33，组件未 export、仅集群内部 JSX `<申请豁免弹窗` 使用，见 quick-exemption-button.tsx:37）
  - 引用证明（2026-09-19 复核）: `rg -n "DashboardWorkspaceHeader|QuickExemptionButton|申请豁免弹窗" src -g '!src/app/(app)/dashboard/components/dashboard-workspace-header.tsx' -g '!src/app/(app)/dashboard/components/quick-exemption-button.tsx' -g '!src/app/(app)/dashboard/申请豁免弹窗.tsx'` → 非测试命中仅 `video-submit-panel-v2.tsx:1028` 的**注释文本**；其余全为测试 readFileSync。生产渲染链用 `redesign/exemption-dialog-v2.tsx`（ExemptionDialogV2），顶栏由 `production-control-system.tsx` 自建 → 静态与 dynamic 引用均闭合。
  - 删除范围: 三文件整删 + `video-submit-panel-v2.tsx:1028` 死注释顺带清（可选）。
  - 测试耦合（§7 专门耦合点，缺一即 ENOENT）: `src/components/ui/dialog-layout.test.ts:26`（readSource 申请豁免弹窗）、`src/app/(app)/dashboard/dashboard-humanistic-copy.test.ts:11,33`、`src/lib/a11y-responsive-integration.test.ts:238-242`（header+quick-button，注意 **:247-248 是 A-14 的 Topic 组件断言，不动**）、`src/app/(app)/dashboard/components/dashboard-workspace-header.test.tsx`（整测试文件随组件删）。
  - 验证命令: `rg -n "DashboardWorkspaceHeader|QuickExemptionButton" src`（空）+ `npm test` + `npm run build`。
  - **前置 NU-1 → 已关闭**: 复核支持"死"（无静态/dynamic import）；**2026-09-19 阿禅拍板"删"**，前端 owner 的运行时确认降级为知会项（如事后发现隐藏入口，git revert 找回，`variant="card"` 快捷豁免分支代码不丢）。
- [x] A-12: 成员降级查询兜底（`src/app/(app)/admin/资料加载.ts`，102 行 + `资料加载.test.ts` 99 行）——2026-09-20 已删（6ea1db67）；线上 5 豁免列+team_id 实查存在
  - 引用证明: `rg -n "loadProfilesWithExemptionFallback|资料加载" src scripts tests -g '!src/app/(app)/admin/资料加载*.ts*'` → 空（2026-09-19 复核：无任何模块路径 importer）。现役同类能力已收口 `src/lib/member-lifecycle.ts`。
  - 删除范围: 两文件整删；若发现调用方（复核后新增）则降级改调 `member-lifecycle` 的 `loadWithMembershipFallback`。
  - 测试耦合: `资料加载.test.ts` 随删。
  - 验证命令: `rg -n "资料加载" src`（空）+ `npm test`。
  - **前置（不可跳过）**: 后端确认生产库 `profiles.exempt_*` 列已全部存在（"豁免列未上线"历史窗口已关）。注意 BLK-4：b3 迁移未提交前不得动此处——本文件正是绑定豁免列存在性的降级逻辑，**与在途迁移直接冲突，等迁移落地**。
- [x] A-13: topic-helpers 死导出清剿（`src/app/(app)/topics/topic-helpers.ts`，195 行）
  - 执行记录 2026-09-19: ① `DETAIL_PAGE_SIZE` 迁入 `v2-client-contract.ts`；② `TopicWorkBreakdownDrawer.tsx:29` import 改指 v2-client-contract；③ `topic-helpers.ts` 整删；④ `page.test.ts`/`[id]/page.test.ts` **整体作废删除**——两文件全部断言只测旧契约死函数（fetchTopicPoolResponse/旧 parse/Recommendation*/ComparisonRow），v2 活契约由 `v2-client-contract.test.ts` 覆盖（parseSubTopicDetailResponse/pagination 断言实测在盘），无覆盖损失。Recommendation* 类型随文件删（阿禅拍板不保留）。
  - 引用证明: 生产唯一 importer `src/components/topics-v2/TopicWorkBreakdownDrawer.tsx:29`（只取 `DETAIL_PAGE_SIZE`，:214 拼 fetch URL）；`src/app/(app)/topics/page.tsx`、`[id]/page.tsx` 均不 import；其余命中全是 `page.test.ts:10` 与 `[id]/page.test.ts:9`。死导出群: `fetchTopicPoolResponse/parseSubTopicDetailResponse/parseSubTopicWorksResponse/countMyCandidates/resolvePageAfterLoad/getRecommendationKey/resolveWorkLikes/calculateTotalInFlight` 及一批类型（L1–195 内，除 :27）。`parseSubTopicDetailResponse` 与 `src/lib/topics/v2-client-contract.ts:486` 同名重复实现（v2 版活）。
  - 删除范围: ① `DETAIL_PAGE_SIZE`（:27，值 20）迁移至 `src/lib/topics/v2-client-contract.ts`；② `TopicWorkBreakdownDrawer.tsx:29` import 改指 v2-client-contract；③ 删 `topic-helpers.ts` 整文件；④ `page.test.ts`/`[id]/page.test.ts` 的 import 改指 v2-client-contract 对应实现（若断言的是 V2 旧契约行为，可能整体作废——执行时判定）。
  - 连带: `TopicWorkBreakdownDrawer` 经 A-14 修正为**活组件**，②必须做、不可连带删。
  - 测试耦合: 上述两个 topics 测试 + 自查 `rg -l "topic-helpers" src --glob '*.test.*'`。
  - 验证命令: `rg -n "topic-helpers" src`（空）+ `npm test` + `npx tsc --noEmit`。
  - 确认人: 产品/前端（V3 是否保留 recommendations 概念）→ **已于 2026-09-19 拍板：删，未来按新架构重做；Recommendation* 类型一并清，无豁免保留项**。
- [x] A-14: ~~topics-v2 三组件零生产引用~~ → **复核修正：不删（2026-09-19）**
  - 修正依据: `TopicHubV2.tsx:32` 直接 import `TopicPoolExplorer`；`:38/:44` `dynamic(() => import("./TopicWorkBreakdownDrawer"|"./TopicMoreFiltersDrawer"))`；`:623/:680/:734` 渲染；`topics/page.tsx:80` 渲染 `TopicHubV2`。报告的 `rg -lN` 追不上 dynamic import（§7 自警盲区）。NU-3 关闭。
  - 本批动作: 无。仅在测试耦合上留意：`topics-v3-frontend-contracts.test.ts`、`windows-adaptation-second-batch.test.ts`、`a11y-responsive-integration.test.ts:247-248` 大量 readSource 这三文件——**A-14 若未来重构，这三处断言必红**。

## 执行步骤

1. 收集签字：产品侧已全部拍板（2026-09-19：A-10 删、A-11 删、A-13 删），执行时知会前端 owner 即可；仅剩后端确认 A-12 迁移完成度（等 BLK-4 落地）。
2. 记录 BASE_SHA；只读 `npx tsc --noEmit` 留底。
3. 按 A-12 → A-10 → A-11 → A-13 顺序执行（先做签字最简的，A-13 牵动面最大放最后）。
4. 每删一簇，同批修对应 readFileSync 测试（本批共触 6 个测试文件，见各条"测试耦合"）。
5. 运行验证命令 + `npm run build`（本批按报告 §8 要求 build 级验收）。
6. commit（不 push）：`cleanup: remove dead clusters after product sign-off (batch 4)`；建议按项拆 commit（A-10/11/12/13 各一），方便单项回滚。

## 验收标准

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过（6 个 readFileSync 耦合测试全绿）
- [ ] rg 验证零引用：`rg -n "RewriteClient|DashboardWorkspaceHeader|QuickExemptionButton|ExemptionModal|loadProfilesWithExemptionFallback|topic-helpers" src` 为空
- [ ] `npm run build` 通过（豁免入口 UI 目测只剩 ExemptionDialogV2 路径）

## 停止条件

产品说保留任一能力（快捷豁免/旧改写 UI/recommendations）→ 该项整项停；A-12 的后端回复"豁免列未全量存在"→ 停（降级逻辑仍有用）。

## 回滚指令

`git reset --hard <BASE_SHA>`（按项拆 commit 时可 `git revert <该项 SHA>` 单点回滚）。
