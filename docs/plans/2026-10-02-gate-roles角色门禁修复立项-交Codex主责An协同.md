# gate:roles 角色门禁修复立项（10 条红 + 脆弱 harness）

> 日期：2026-10-02　状态：待施工　主责：Codex（harness + 种子数据）　协同：Antigravity（选择器 + 页面数据形状）
> 本文档自足，新会话读本文即可开工。背景结论已经多方核验（git 佐证 + 双端实测），不重复争论。

## 一、现状

- `npm run gate:roles`（Playwright，testDir=`tests/roles`，6 个 spec 共 23 条）当前基线：**13 绿 / 10 红**（2026-10-02 Antigravity 全量台账）。
- 这 10 条红**与已上线的补交线（62d360af…6eae172f，2026-10-02 push）无关**，证据：① 该线改动文件清单不含 10 条红所测模块；② `评级筛选` 标签在 origin/main 的 content-list 中命中数已为 0（本轮前即不存在）。
- 另发现 **harness 脆弱点**（2026-10-02 千问办公实测）：直接 `npm run gate:roles` 时，Playwright 自动起的 webServer（`next start -p 3100`）**只读 `.env.local`（生产）**，不读 `--env-file-if-exists=.env.ai-test.local`（该 env-file 只注入 Playwright 测试进程，不传进 next start）→ 应用 SSR 报 `SupabaseQueryFailure: Invalid API key`，**全线 19 红（连补交 7 条也挂）**。
- 因此当前唯一可靠跑法是隐知识：先手工起一个连**本地测试库**的 :3100，再跑 gate:roles 让 Playwright `reuseExistingServer` 复用（Antigravity 2026-10-02 用此法跑绿补交 7 条，截图 `output/01–07`）。**此隐知识必须消除（见三.1）。**

## 二、10 条红的根因（两类）

### A. 本地测试库无业务数据（9 条，现象为超时/找不到行）
种子数据必须覆盖以下断言形态（均为"9 月、多岗位"口径）：

| spec | 条数 | 断言需要的数据 |
|---|---|---|
| 个人档案增长曲线.spec | 2 | /admin/collaboration 文案/剪辑岗位成员行、`.recharts-surface` 折线图与行情带（9 月多岗位产量/指标序列） |
| 抽屉交互终验.spec | 1 | 达人页签表格行（打开抽屉 6 场景） |
| 数据管理作品复盘只读.spec | 3 | /admin/content 作品行（`button.truncate.text-left`）+ 组员/组长/所有者三视角抽屉 |
| 文案内容质量三入口.spec ②③ | 2 | 小队看板良优率聚合表、/topics 选题抽屉历史关联作品 |
| 文案内容质量目标.spec ⑤ | 1 | 个人档案抽屉"本月文案作品"胶囊与折线 |

### B. 孤儿选择器（1 条）
- `tests/roles/文案内容质量三入口.spec.ts:61` `page.getByLabel("评级筛选")` —— 该 aria-label 已在 `b1b04a6d`（筛选栏单排重构，已在 origin/main）中移除。需按**新筛选栏真实控件**更新（以组件实抓可访问名为准，不臆造），同步改测试名与注释（40/60 行附近）。

## 三、修复方案

1. **[Codex] 修 harness，消除隐知识**：改 `playwright.role.config.ts` 的 `webServer.command`，让应用吃到测试库 env（候选：`node --env-file-if-exists=.env.ai-test.local node_modules/next/dist/bin/next start -p 3100` 或等价方式），保留 `reuseExistingServer`。验收 = 干净环境直接 `npm run gate:roles` 不再出现 Invalid API key。
2. **[Codex] 新写幂等种子**：**不要沿用 `scripts/seed-real-test-data.ts` 的做法**——它面向选题库、且以 achan/陈晨等**真实成员 ID** 为锚点，本地隔离库不适用。新脚本面向本地库测试用户（test-member/test-leader 及组员集），按二.A 表造数（daily_reports/videos/accounts/sub_topics 及关联/聚合），**幂等可重跑不堆积**，提供 `package.json` script（如 `seed:roles`）。
3. **[Antigravity] 修二.B 选择器**，并协同 Codex 定稿 9 条红页面的数据形状（页面断言细节 An 最熟）。

## 四、验收（硬门禁）

- [x] 干净环境一条命令 `npm run gate:roles` → **23/23 绿**；连跑两次结果一致（幂等）
- [x] 无任何测试断言被放宽来迁就空数据（diff 审查：不得出现"接受无数据/跳过断言/放宽超时凑过"）
- [x] 种子只写本地隔离库（54321），不触生产；不引用真实成员 ID 作数据锚点
- [x] 仓库无新增明文密钥（凭据一律走 env，参考补交 spec 的写法）
- [x] `npm run gate:static` 保持全绿（1889 单测 / tsc / eslint / build）
- [x] 留运行证据（output/ 截图）并登记 `日志/`

### 2026-10-02 施工证据

- `npm run gate:roles` 连跑两次均为 **23 passed**；命令自动执行 `seed:roles`、构建并启动本地服务，无需手工预启动 `:3100`。
- `npm run gate:static`：1889/1889 测试通过，tsc 通过，ESLint 0 error，build 成功（现有 warning 未新增）。
- 浏览器截图证据：`/tmp/drawer-screenshots/01-personal-card-672px.png`、`02-inline-diagnosis-896px.png`、`03a-confirm-banner-active.png`、`03b-confirm-banner-esc-dismissed.png`、`05-return-to-personal-card-672px.png`、`06-staff-tab-direct-diagnosis.png`、`07-staff-tab-esc-closed.png`。
- 种子脚本为本地 host 守卫 + 动态 Auth 用户 ID + 固定自有 fixture ID，未读取或引用真实成员 ID；运行两次均幂等。

## 五、禁区

- 不动已上线补交审批逻辑与 fulfillment/api 代码
- 不改 `tests/performance` 与 gate:static 范围
- 不改 `.env.local` / 生产 env / 生产库
- 不为过而过：禁止喂假数据绕断言、禁止改门禁脚本掩盖失败

## 六、参考

- 角色配置：`playwright.role.config.ts`（webServer 段即三.1 落点）
- 凭据 env：`.env.ai-test.local`（只读键名，不入库）
- env 读取凭据的范例写法：`tests/roles/发布时间与补交门禁端到端.spec.ts`
- 时间线：`b1b04a6d` 筛选栏重构（origin/main）移除"评级筛选"→ 补交线 `6eae172f` 上线（2026-10-02）
