---
批次 1: 纯前端零引用收尾
优先级: P1
预估工时: 0.5h
前置依赖: BLK-5（动手前只读跑一次 npx tsc --noEmit）
---

> 原批次 1（A-01~A-09）的绝大部分已在提交 `05066dd1`（cleanup: remove confirmed dead frontend code）落地。
> 本清单为磁盘复核后（`main @ c0beeeed`，2026-09-19）仍存在的两项残留 + 两项 2026-09-19 阿禅拍板新转入（B-05、B-13）。四项决策口径均已确认，无待问事项。
>
> **2026-09-19 阿禅授权**: 本批可先行执行、无需等阶段 0（当前先不跑，等调度）。

## 清理清单

- [x] A-07(残): 未接线的 `fetchConversations` 暴露项（`src/components/content-tools/rewrite-v3/useRewriteV3Logic.ts:623`）
  - 执行记录 2026-09-19: 磁盘复核发现 return 对象（现 :715-734）本就不含 `fetchConversations`，:623 实为 useCallback 依赖数组（内部使用、按规格保留）。该项已在 `05066dd1` 后落地，无需改动，验收 rg 为空。
  - 注: 报告路径写作 `content-tools/rewrite/`，实际目录为 `content-tools/rewrite-v3/`。报告中 `traceabilityMode`/`selectedParagraphIds` 两对 useState 已在先前提交清除，仅剩本项。
  - 引用证明: `rg -n "actions\.fetchConversations" src` → 应为空；消费侧全量枚举 `rg -oN "actions\.[A-Za-z]+" src/components/content-tools/rewrite-v3/RewriteWorkbenchV3.tsx | sort -u` → 无 fetchConversations。
  - 删除范围: 仅删 return 对象中的 `fetchConversations,` 一行（:623）。**内部函数（:120）及其 :243/:302/:458 调用点保留**，它仍被内部使用。
  - 测试耦合: `src/components/windows-adaptation-second-batch.test.ts` 以 `readFileSync` 读 `useRewriteV3Logic.ts` 源码——复核未命中 `fetchConversations` 字符串断言（`rg -n "fetchConversations" src --glob '*.test.*'` 为空），删后跑该测试确认。
  - 验证命令: `npm test`（定向 `tsx --test src/components/windows-adaptation-second-batch.test.ts`）+ 上述两条 rg。
  - 备注: ~~确认人=产品~~ → **2026-09-19 阿禅拍板"清理"**：溯源/多选不在恢复计划，将来若做按新设计重建，本项无条件执行。
- [x] A-09(残): `streamRewriteChat` 旧流式入口（`src/lib/rewrite/shared.ts:2554`，函数体至 :2603）——2026-09-19 已删，tsc/test 通过
  - 引用证明: `rg -n "\bstreamRewriteChat\b" src scripts tests` → 仅命中 `shared.ts:2554` 定义行（2026-09-19 复核确认）。现流式走 `generation.ts`。
  - 删除范围: `src/lib/rewrite/shared.ts` L2554–L2603（函数整体）。**只删该函数，文件其余部分在用，勿动。**
  - 测试耦合: `rg -n "streamRewriteChat" src --glob '*.test.*'` 为空；但 `rg -l "rewrite/shared" src --glob '*.test.*'` 需自查——若有测试 readFileSync 本文件做源码断言，确认其断言不含被删函数名后再删。
  - 验证命令: `rg -n "\bstreamRewriteChat\b" src`（空）+ `npx tsc --noEmit` + `npm test`。
- [x] B-13(新转入): `TopicPoolExplorer.tsx` 恒隐藏的"尚未选稿"占位（`src/components/topics-v2/TopicPoolExplorer.tsx:602-605`）——2026-09-19 已删
  - 决策记录: 2026-09-19 阿禅拍板"没必要显示"——该状态永不出现，删注释+隐藏 span（其注释自述"留待需要时启用"即从未接线的自证）。
  - 引用证明: `rg -n "尚未选稿" src scripts tests` → 仅 `TopicPoolExplorer.tsx:602,604` 自身；无测试 readFileSync 断言此片段。
  - 删除范围: L602–L605（注释+span 块）。**只删这一块，文件本体是活组件（A-14 修正），其余勿动。**
  - 测试耦合: 无（该文件被多处测试 readSource，但断言不涉及此片段；删后跑 `npm test` 兜底）。
  - 验证命令: `rg -n "尚未选稿" src scripts`（空）+ `npx tsc --noEmit` + `npm test`。
- [x] B-05(新转入): 按成员分组告警死模块（`src/app/(app)/dashboard/alert-groups.ts`，48 行，`groupDashboardAlerts` :22）——2026-09-19 源文件+存在性断言测试两文件同删
  - 决策记录: 2026-09-19 阿禅拍板"不做，删"——看板告警维持现状列表展示，不恢复分组。
  - 引用证明: `rg -n "groupDashboardAlerts|alert-groups" src scripts -g '!src/app/(app)/dashboard/alert-groups*'` → 空（2026-09-19 复核）。仅 `alert-groups.test.ts`（51 行）在用。
  - 删除范围: `alert-groups.ts` + `alert-groups.test.ts` 两文件整删。
  - 测试耦合: ⚠️ 该测试用 `await import(new URL(...)).catch(()=>null)` + `assert.ok(mod)` 做**文件存在性断言**（静态 grep 会漏）——必须与源文件同删，否则测试红。
  - 验证命令: `rg -n "alert-groups|groupDashboardAlerts" src`（空）+ `npm test`。

## 执行步骤

1. 读取本批次清单，`git rev-parse HEAD` 记录 BASE_SHA。
2. 逐项删除代码（先 Read 确认行号未漂移——报告基线 d93b0ab 与本清单基线 c0beeeed 之间 src/ 有变更，动手前以 `rg -n` 实测行号为准）。
3. 同步修改测试（本批预计无测试需改，以复核命令为准）。
4. 运行验证命令。
5. commit（不 push）：`cleanup: remove leftover dead rewrite symbols (batch 1)`。

## 验收标准

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过
- [ ] `rg -n "\bstreamRewriteChat\b|actions\.fetchConversations|groupDashboardAlerts|尚未选稿" src` 输出为空

## 停止条件

任一符号/文件出现意外 import 或 readSource 断言命中被删内容 → 该项跳过并记录原因，不阻塞其余项（产品口径已全部确认，无需停下来等人）。

## 回滚指令

`git reset --hard <BASE_SHA>`（批次开始前 `git rev-parse HEAD` 的值；若无其他提交插入，即 `c0beeeed297c8374159a4685f5cb732058b0a091`）。
