---
批次 5: 中间件/配置死项
优先级: P2
预估工时: 1.5h
前置依赖: A-28 须前端/构建 owner 签字（牵动 npm 依赖移除）；A-27/A-29/A-30/A-33 已在提交 45d6e704 等批次完成，本批仅剩 A-28、A-31、A-32 三项。**2026-09-19 阿禅授权**：A-31/A-32（纯配置符号、不触构建）可先行执行；A-28 仍等签字
---

> 复核注：`src/lib/permissions/` 空目录（A-33）已回收、middleware `/violations` 分支与 matcher（A-27）已删、`perf:ttfb`（A-29）与 `/demo` 重定向（A-30）已清、eslint 中 `.next 2/**` glob 已不在盘上——本批行号全部按 `main @ c0beeeed` 实测重标。

## 清理清单

- [x] A-28: `tailwind.config.ts` 整体死配置（Tailwind v4 CSS-first，文件不加载）——2026-09-20 已删（0a9d11cb：config+依赖+lock 刷新；npm run build 通过，产物无差异由 Codex 实验+本轮复验双重确认；tw-animate-css 保留）
  - 引用证明（2026-09-19 复测）: `rg -n "tailwind.config" src postcss.config.mjs components.json` → 空；`src/app/globals.css:3` 已 `@import "tw-animate-css"`、`:11` `@theme inline` 重定义全套 token；`ls src/pages` → 不存在（config 的 content 指向死路径）；`components.json` 的 `tailwind.config` 字段为空串。
  - 删除范围: 删 `tailwind.config.ts` 整文件 + `package.json:43` `tailwindcss-animate` 依赖（`rg -n "tailwindcss-animate" --glob '!package-lock.json' .` 实测仅 tailwind.config.ts:2 一处 import，删文件后依赖即孤儿；注意与 globals 用的 `tw-animate-css` 是两个包，**勿误删后者**）+ `npm install` 刷新 lock。
  - 测试耦合: 无测试断言此文件（自查 `rg -l "tailwind.config" src --glob '*.test.*'`）。
  - 验证命令: `rg -n "tailwind.config" src postcss.config.mjs package.json`（空）+ `npm run build` 通过 + **构建后目测主题/动画**（重点：dashboard 色板 `--color-claude-*`、serif 字体、shadow、动画类）。
  - 风险: 中（删错丢样式兜底）→ 停止条件：build 后任何主题回归即回滚。
- [x] A-31: `eslint.config.mjs` globalIgnores 指向不存在目录（低价值，可做可不做）——2026-09-19 已删 glob；生产线第二回合实删 4 条（`.next 2/**`、`.open-next/**`、`out/**`、`build/**`，均实测不存在）
  - 引用证明: `.open-next/`、`out/`、`build/` 实测不存在（`ls -d` 逐一）；保留项：`.next/**`、`.next.old*/**`（`.next.old-1788498024/` 在盘上）、`.claude/**`、`.agents/**`、`output/**`（在盘上，§7）、`next-env.d.ts`。
  - 删除范围: `eslint.config.mjs` 第 13、17、18 行（`".open-next/**"`, `"out/**"`, `"build/**"`）。
  - 测试耦合: 无。
  - 验证命令: `npm run lint`（注：lint 门禁本身受无关历史问题影响时，以 eslint 对本清单文件的退出码为准）。
  - 备注: 防御性 glob，防未来产物目录误扫；删除收益极低，若 owner 认为应保留"防御性忽略"可不删并记录决定。
- [x] A-32: 权限层死导出（纯代码，不触 DB，可安全删）
  - 执行记录 2026-09-19（第二回合完成）: `permission-contract.ts` 两项（`isPermissionKey`/`getPermissionsForRole`）与 `company-permissions.ts` 三项（`COMPANY_ROLES`/`isCompanyRole`/`canOperateCurrentMembership`）**全部删除**。company-permissions 三项此前因权限改造在途停手，改造落地（`6ec069de`）后复测外部引用仍为空，解除停手。活函数 `fixedPermissionsForRole`/`hasFixedPermission` 未动。
  - 明细与行号（2026-09-19 实测，注意与报告基线有漂移）:
    - `src/lib/permission-contract.ts:116` `isPermissionKey`、`:126` `getPermissionsForRole`
    - `src/lib/company-permissions.ts:8` `COMPANY_ROLES`、`:70` `isCompanyRole`（报告写 :30，已漂移）、`:112` `canOperateCurrentMembership`（报告写 :72，已漂移）
  - 引用证明: `rg -n "\b(isPermissionKey|getPermissionsForRole|COMPANY_ROLES|isCompanyRole|canOperateCurrentMembership)\b" src scripts tests -g '!src/lib/permission-contract.ts' -g '!src/lib/company-permissions.ts'` → 空（含测试目录，2026-09-19 复测）；定义文件内部交叉使用逐条 Read 确认（`fixedPermissionsForRole:90`/`hasFixedPermission:104` 是活函数，勿顺手删）。
  - 删除范围: 上述 5 个导出各自函数体/常量；若被活函数内部引用则只去 `export` 关键字。
  - 测试耦合: 无（复测已含 tests glob）。
  - 验证命令: `npx tsc --noEmit` + `npm test` + 同上映零复验。
  - 确认人: 前端/后端知会即可。

## 执行步骤

1. A-28 拿到构建 owner 签字后再动。
2. 记录 BASE_SHA；只读 `npx tsc --noEmit` 留底。
3. 先做 A-32（零风险纯符号），再做 A-31，最后做 A-28（牵动依赖与构建产物，单独 commit）。
4. 运行验证命令；A-28 后必须 `npm run build` + 目测。
5. commit（不 push）：建议拆两个——`cleanup: drop dead permission-layer exports & eslint globs (batch 5a)`、`build: remove dead tailwind.config and orphan dep (batch 5b)`。

## 验收标准

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过
- [ ] rg 验证零引用（各条验证命令全空）
- [ ] `npm run build` 通过且主题目测无回归（A-28 专属）

## 停止条件

A-28 build 后样式回归 → 回滚 5b 单commit；owner 不签字 → A-28 整项搁置，5a 照做。

## 回滚指令

`git reset --hard <BASE_SHA>`；A-28 单独 commit 时可 `git revert` 该 commit（lock 文件一并恢复）。
