---
批次 6: 文档更正（只改措辞不删文件）+ 过期产物归档
优先级: P2
预估工时: 0.5h（不含 gate:static 运行等待）
前置依赖: F-DOC-2 口径已在提交 08aa42c2 统一（无需再动，见下"已完成"）；F-DOC-8 已拍板并于 2026-09-19 执行完毕。**2026-09-19 阿禅授权**：本批可先行执行、无需等阶段 0（当前先不跑，等调度）
---

> 复核重大更新：报告 §6 的 8 条中，**F-DOC-1、F-DOC-2、F-DOC-4、F-DOC-6 已在提交 `08aa42c2`（docs: align cleanup and release rules）更正完毕**，F-DOC-8 已拍板执行；本批剩余执行项 = F-DOC-3、F-DOC-5、A-34 三项。
> 文档批不适用 tsc/rg 零引用类验收，验证以"人工复核 + 定向命令"为准；`npm test` 不受文档影响，跑一次兜底即可。

## 清理清单

- [ ] F-DOC-1（已完成·验收性核验）: 模块地图死接口表述
  - 现状（2026-09-19 实测）: `docs/全站模块地图.md:116` 已改写为"均已清除 + 现行接口为 exemptions/submission-screenshots"；`:261` 反例保护清单已剔除 `publish-drafts`、`fulfillment/appeal/submit` 并给出现行端点。
  - 验证命令: `rg -n "work-submissions|publish-drafts" docs/全站模块地图.md` → 人工确认所有命中均为"已清除"语境。
- [ ] F-DOC-2（已完成·验收性核验）: push main 三处冲突
  - 现状: `AGENTS.md:125` 已统一为"默认只 commit；push main 前必须当前轮明确授权并核对 SHA"；`docs/工程运行事实.md:99` 同口径。
  - 验证命令: `rg -n "push main|push 前" AGENTS.md README.md docs/工程运行事实.md` → 三份口径一致（README 若仍留旧句，一并对齐，属本项收尾）。
- [ ] F-DOC-3（待执行）: 过期计数漂移
  - 停手记录 2026-09-19: 实测计数 52 与清单一致，但 `docs/权限与安全说明.md` 有他人在途未提交改动（权限架构改造，5+/2-），提交更正会裹挟在途工作 → 按 BLK-4 纪律搁置，待其落地后再改。
  - 事实: `docs/权限与安全说明.md:285` 写"约 61 个后台 route"；2026-09-19 实测 `rg -l "createAdminClient|createServiceClient" src/app/api | wc -l` = **52**。
  - 更正范围: 该行改为"约 50+（2026-09-19 实测 52；改权限前须现扫，勿引用静态计数）"。
  - 测试耦合: 无。
  - 验证命令: 执行更正当天重跑计数命令，与文中数字差 ≤5。
- [ ] F-DOC-4（已完成·核验）: "已删页面说成重定向"
  - 现状: `docs/reference/项目事实.md:34` 已改为"已下线…按不存在页面处理，不应再写成统一重定向"。
  - 验证命令: `rg -n "ai-channels|ai-features" docs/reference/项目事实.md docs/全站模块地图.md` → 人工确认无"重定向"误导表述残留。
- [ ] F-DOC-5（待执行·条件）: 待办勾销
  - 停手记录 2026-09-19: `npm run gate:static` 退出码 1，唯一失败为未跟踪在途测试 `src/lib/b3-database-boundary-migration.test.ts`（断言缺失的 B3 migration 文件，非本批引入）；且 `docs/待办清单.md` 有他人在途改动 → 按条件"lint 仍被阻断则不勾销"搁置。animations.ts 修复本身已在盘上（:230 requestAnimationFrame）。
  - 事实: 代码侧已修——`src/lib/animations.ts` 现以 `window.requestAnimationFrame(() => setValue(to))` 实现（2026-09-19 抽查 :228-233）；`docs/待办清单.md:23` 该条仍挂账。
  - 更正范围: 跑 `npm run gate:static`，**退出码 0 后**把 `docs/待办清单.md:23` 勾销并注"复核于 <日期>"；若 lint 仍被其他既有问题阻断（历史上有 `animations.ts:229` 之外的阻断先例），只更新待办描述、不勾销。
  - 验证命令: `npm run gate:static; echo $?`。
- [ ] F-DOC-6（已完成·核验）: 履约统计收敛原因
  - 现状: `docs/全站模块地图.md:184` 已补"因为成员页只负责组织与权限管理…避免重复查询和职责混杂"。
- [ ] F-DOC-7（确认无误·勿动）: AGENTS.md Next.js 自动注入块（:158-166 附近）、`invite_code` 文档一致性、`docs/archive/` 落位——三项均无需动作，**在功能 PR 里反复删注入块反而是错**，登记备忘即可。
- [x] F-DOC-8（已拍板并执行 · 2026-09-19）: 根级 loose md 归属
  - 拍板: 阿禅确认默认方案。已执行——`复盘-2026-09-17.md` → `docs/reference/2026-09-17-工程复盘.md`；`思想-哲学-思考与反思.md` → 移出项目至第二大脑个人域（`个人中心/`）。两文件原均 untracked，无 git 操作需要；`findings.md/progress.md/task_plan.md` 与根级 `.png` 已 gitignore，维持本机自归档不处理。
  - 验证: 仓库根 `ls 复盘* 思想*` 为空（2026-09-19 已核）。
- [x] A-34: 已提交的过期验收产物归档
  - 执行记录 2026-09-19: `git mv` 两文件至 `docs/archive/`，无测试耦合（rg 自查为空）。
  - 引用证明: `git ls-files test-h1-rpc-logic.md test-h1-rpc-scenarios.sql` → 两文件均已跟踪（2026-09-19 实测）；AGENTS/工程事实规定一次性施工产物不提交；`admin_grant_exemption_for_dates` RPC 代码仍用（**归档文档 ≠ 动 RPC**）。
  - 删除范围: 不删——`git mv test-h1-rpc-logic.md test-h1-rpc-scenarios.sql docs/archive/`（仅移动）。
  - 测试耦合: `rg -l "test-h1-rpc" src scripts --glob '*.test.*'` 先行自查（若有测试 readFileSync 该 .sql 路径，改路径或删除断言）。
  - 验证命令: `npm test` + `git log --stat -1` 复核仅移动。

## 执行步骤

1. 读取本批次清单与"已完成"三项的现状复核（若复核发现被后续提交再改回，按报告原文重新更正）。
2. 逐项执行 F-DOC-3 → F-DOC-5 → A-34（F-DOC-8 已于 2026-09-19 拍板并执行完毕）。
3. 人工复核措辞（重点：不删文件、不引入新的绝对计数）。
4. 运行各条验证命令。
5. commit（不 push）：`docs: correct stale counts and archive one-off test artifacts (batch 6)`。

## 验收标准

- [ ] `npm test` 通过（兜底，文档批理论上不影响）
- [ ] `rg -n "约 61" docs/权限与安全说明.md` 为空
- [ ] `git status --short` 中根级不再出现待判断 loose md / test-h1-rpc 两文件
- [ ] F-DOC-5 的 gate:static 结果（0 或注明阻断原因）写入待办清单

## 回滚指令

`git reset --hard <BASE_SHA>`；A-34 的 `git mv` 可单独 `git revert`。
