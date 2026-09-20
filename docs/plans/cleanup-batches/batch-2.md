---
批次 2: 攻击面收敛（死写入口优先）
优先级: P0
预估工时: 2.5h
前置依赖: NU-2（复核已基本关闭，删前留签字）、BLK-4（b3 权限迁移/team-join 在途改动先落地或冻结）、后端 + 权限 owner 签字（写路径收口）、BLK-6（运维确认无外部按编译 action id 的 POST）
---

> 这些是"可达的死写入口"（"use server" 导出即可被 POST，内部 `createAdminClient()` 绕 RLS），收敛优先级高于普通死代码。
> **2026-09-20 批次完成**：AI 独立核查（2026-09-20-ai-verification.md）+ 阿禅拍板后，A-15a~f、A-16~18 已删（ff0b5860/ebb37a3c）；A-15g/h 拍板保留。原"等 owner 签字"前置按新口径由 AI 复核 + 阿禅拍板替代。
> 行号已按 `main @ c0beeeed` 复核更新（与报告基线 d93b0ab 相比整体下移约 5 行）。删除边界：从函数定义行起，删到同文件下一个 `export` 定义行前一行；**执行前必须 Read 该文件确认边界，不数行数硬删**。

## 清理清单

- [x] A-15a: `updateExemption`（`src/app/(app)/admin/actions.ts:258`，止于 :343）——2026-09-20 已删（ff0b5860）
  - 引用证明: `rg -n "\bupdateExemption\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'` → 空（2026-09-19 复验）。已被 API `/api/exemptions/apply`（UI 在用）取代。
  - 删除范围: L258–L343（至 `clearExemption` 定义前）。
  - 测试耦合: 上式已排除测试目录确认无引用；保险自查 `rg -l "updateExemption" src --glob '*.test.*'`。
  - 验证命令: `rg -n "\bupdateExemption\b" src`（仅剩 0 命中）+ `npx tsc --noEmit`。
- [x] A-15b: `clearExemption`（`admin/actions.ts:344`，止于 :391）——2026-09-20 已删（ff0b5860）
  - 引用证明: `rg -n "\bclearExemption\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'` → 空。
  - 删除范围: L344–L391。
  - 测试耦合: 同上保险自查。注意豁免回收 reopen 走的是 API 侧，与本 action 无关。
  - 验证命令: `rg -n "\bclearExemption\b" src`。
- [x] A-15c: `adminUpdateReport`（`admin/actions.ts:519`，止于 :553）——2026-09-20 已删（ff0b5860）
  - 引用证明: `rg -n "\badminUpdateReport\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'` → 空。报表编辑走 `/api/video-submit/edit-detail`。
  - 删除范围: L519–L553。
  - 测试耦合: 无（复核 `rg -l "adminUpdateReport" src --glob '*.test.*'` 为空）。
  - 验证命令: 同引用证明。
- [x] A-15d: `adminDeleteReport`（`admin/actions.ts:554`，止于下一个保留定义前，约 :830 前——中间函数以 Read 为准）——2026-09-20 已删（ff0b5860）
  - 引用证明: `rg -n "\badminDeleteReport\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'` → 空。
  - 删除范围: L554 起至下一个 export 前。
  - 测试耦合: 无。
  - 验证命令: 同引用证明。
- [x] A-15e: `removeMemberFromTeam`（`admin/actions.ts:831`）——2026-09-20 已删（ff0b5860）
  - 引用证明: `rg -n "\bremoveMemberFromTeam\b" src scripts tests -g '!src/app/(app)/admin/actions.ts'` → 空。仅是 `updateMemberTeam(uid,null)` 薄包装；成员移除被 `archiveMember` 取代。
  - 删除范围: L831 起至函数结束（Read 确认）。
  - 测试耦合: 无（复核为空）。
  - 验证命令: 同引用证明 + `npm test` 定向 `src/lib/team-join` 相关不受影响确认（BLK-4：若 team-join 在途改动碰此文件，先冻结再删）。
- [x] A-15f: `hasPendingExemptionRequest`（`src/app/(app)/dashboard/actions.ts:188`）——2026-09-20 已删（ff0b5860，含 3 个孤儿 import 清理）
  - 引用证明: `rg -n "\bhasPendingExemptionRequest\b" src scripts tests -g '!src/app/(app)/dashboard/actions.ts'` → 空（2026-09-19 复验）。pending 判定现由 loader/action-center 处理。
  - 删除范围: L188 起至函数结束。
  - 测试耦合: 复核 `rg -l "hasPendingExemptionRequest" src --glob '*.test.*'` 为空。
  - 验证命令: 同引用证明。
- [x] A-15g: `reviewExemptionRequest`（`admin/actions.ts:463`，止于 :518）—— **条件项** ——2026-09-20 阿禅拍板：不删（保留）
  - 引用证明: 非定义引用仅剩守卫断言 `src/lib/atomic-exemption-migration.test.ts:109`（对 `adminActions.indexOf("export async function reviewExemptionRequest")` 的源码字符串断言）；审批已由 `POST /api/exemptions/review` 承载。
  - 删除范围: L463–L518 + **同步修改** `src/lib/atomic-exemption-migration.test.ts:109` 附近断言（删该断言或改指向 API 端点文件，取守卫原意）。
  - 测试耦合: `atomic-exemption-migration.test.ts`（专门耦合点，§7）。
  - 验证命令: `npm test` 定向该测试 + `rg -n "\breviewExemptionRequest\b" src`（应仅剩测试改写后的引用或全空）。
  - 备注: 报告置信降中（同文件豁免集群仍在途）；与 BLK-4 的 b3 豁免迁移有交集，**必须等迁移落地**。
- [x] A-15h: `submitExemptionRequest`（admin 重复版，`admin/actions.ts:392`，止于 :462）—— **待 NU-2 签字** ——2026-09-20 阿禅拍板：不删（保留）
  - 引用证明（复核修正 NU-2）: `rg -n "\bsubmitExemptionRequest\b" src scripts tests` → 消费方 `video-submit-panel-v2.tsx:34/1039`、`申请豁免弹窗.tsx:17/163` 均 `from "./actions"` 解析到 **dashboard/actions.ts:372**；admin 版 :392 零 importer。`video-submit-form-v2-layout.test.ts:64` 断言的是 panel 源码字符串，不读 admin 文件，无需改。
  - 删除范围: L392–L462。
  - 测试耦合: 无直接；但 `dashboard/申请豁免弹窗.tsx` 若日后按 A-11 删除集群，需回看此处（两版语义相同，dashboard 版保留）。
  - 验证命令: `rg -n "from \"\./actions\"" "src/app/(app)/admin" ` 确认无文件 import 该符号 + `npm test`。
  - 备注: 后端 owner 签字前不删；若签字确认存在独立调用路径则整项作废并回填 NU-2。
- [x] A-16: 死 handler `buildSummaryResponse`（`src/app/api/admin/collaboration/handlers.ts:25`）、`buildOperatorsResponse`（`handlers.ts:47`）——2026-09-20 已删（ebb37a3c，连带 4 个孤儿 loader）
  - 引用证明: `rg -n "buildSummaryResponse|buildOperatorsResponse" src scripts tests` → 仅 handlers.ts 定义行；且 `ls src/app/api/admin/collaboration/` 下无 summary/operators 路由目录（2026-09-19 实测）。逻辑已由 `_shared.buildCollaborationPageData` 服务端单渲染取代。
  - 删除范围: `handlers.ts` L25–L46、L47–L69（至 buildStaffResponse 前）。**⚠️ 修正：handlers.ts 不可整删——`buildPersonResponse`/`buildAttributionResponse`/`buildUnattributedResponse` 被活路由引用（person/attribution/unattributed）。**
  - 测试耦合: `rg -l "handlers" src/app/api/admin/collaboration --glob '*.test.*'` → `attribution/route.test.ts`、`person/route.test.ts` 只 import 活函数，不受影响。
  - 验证命令: 同引用证明 + `npm test` 定向 collaboration 相关。
- [x] A-17: `/api/admin/collaboration/staff` 整路由死——2026-09-20 已删（ebb37a3c：staff/ 目录 + buildStaffResponse + loadStaffData）
  - 引用证明: `rg -n "collaboration/staff" src scripts tests docs` → src 内仅命中路由自身与 handlers；docs 命中均为文档/计划书（本清单不算引用）。工作台为服务端组件 `collaboration-data-container.tsx:11` 直用 `_shared.buildStaff`，不 fetch。
  - 删除范围: 删 `src/app/api/admin/collaboration/staff/` 整目录（route.ts，GET 在 :5）+ `handlers.ts:70` 的 `buildStaffResponse`（止于 :97）。
  - 测试耦合: `rg -l "buildStaffResponse|staff/route" src --glob '*.test.*'` → 复核无命中；`_shared.test.ts` 测 `_shared` 不测 handlers。
  - 验证命令: `rg -n "collaboration/staff" src`（空）+ `npx tsc --noEmit`。
- [x] A-18: `/api/admin/collaboration/talents` 整路由死（同 A-17 模式）——2026-09-20 已删（ebb37a3c：talents/ 目录 + buildTalentsResponse + loadTalentsData；A-16/17/18 合计连带删 loadSummaryData/loadOperatorsData）
  - 引用证明: `rg -n "collaboration/talents" src scripts docs` → 同上仅定义自身；达人 tab 走 `_shared.buildTalents`。
  - 删除范围: 删 `src/app/api/admin/collaboration/talents/` 整目录（route.ts，GET :5）+ `handlers.ts:98` 的 `buildTalentsResponse`。删完 A-16/17/18 后检查 handlers.ts 是否只剩活函数。
  - 测试耦合: 同 A-17 自查式。
  - 验证命令: `rg -n "collaboration/talents|buildTalentsResponse" src`（空）。

## 执行步骤

1. 确认前置：BLK-4 已落地/冻结、后端+权限 owner 对写路径收口签字、NU-2 结论签认。
2. 读取本批次清单，`git rev-parse HEAD` 记录 BASE_SHA，跑只读 `npx tsc --noEmit` 留底。
3. 逐项删除代码（每项删前先 `rg -n` 复验行号未漂移；函数边界以 Read 为准）。
4. 同步修改 `atomic-exemption-migration.test.ts` 守卫断言（A-15g）。
5. 运行验证命令：全部符号 rg 复验 + `npx tsc --noEmit` + `npm test`。
6. commit（不 push）：`security: remove dead server actions and collaboration routes (batch 2)`。

## 验收标准

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过（含 `atomic-exemption-migration.test.ts` 改后）
- [ ] rg 验证零引用：`rg -n "\b(updateExemption|clearExemption|adminUpdateReport|adminDeleteReport|removeMemberFromTeam|hasPendingExemptionRequest|buildSummaryResponse|buildOperatorsResponse|buildStaffResponse|buildTalentsResponse)\b" src scripts tests` 为空；A-15g/h 另按签字结果单独核验
- [ ] 不再存在 `src/app/api/admin/collaboration/staff/`、`talents/` 目录

## 停止条件

发现外部按编译 action id 调用的证据（运维反馈/日志）→ 该项停；`actions.ts` 出现新的生产 importer → 该项停。

## 回滚指令

`git reset --hard <BASE_SHA>`（本批前 `git rev-parse HEAD`；无插入提交时为 `c0beeeed297c8374159a4685f5cb732058b0a091`）。
