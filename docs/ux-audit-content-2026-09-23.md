# UX 审计：DYData 视频复盘（`/admin/content`）

**日期**：2026-09-23
**范围**：视频复盘全链路（列表 / 筛选 / 排序 / 分页 / 详情抽屉 / 回收站 / 深链 / 权限）
**URL**：`http://localhost:3000/admin/content`（本地 dev：NEXT_PUBLIC_SUPABASE 连**生产** Supabase）
**主视角（Persona）**：内容负责人（阿禅本人账号，`company_owner`）—— 页面自我定位是「这里专为管理者打造，旨在 30 秒内快速抓住一条视频的核心问题并完成闭环」，所以审计按这个角色的真实一天走
**对照视角**：组员（`test-member@dydata.test`，`member`，受限）
**浏览器**：本地 Chromium（Playwright 1.62.1，`deviceScaleFactor: 1` → 截图 1:1 无缩放）
**视口**：1440×900 基线 + 1280 / 1024 / 768 / 375 扫描
**写操作**：**全程只读**。审计中一次非预期的 `PATCH …/lifecycle`（点「恢复作品」，该按钮无二次确认）—— 已核查生产库**净零**（该视频仍为 `trashed`，`trashed_at` 未变），详见 H2/H3

---

## 摘要

视频复盘**主体做得扎实**：详情抽屉的模态行为、破坏性操作的就地确认、回收站保护期说明、权限拒绝页、空态文案，都在水准线以上；全程 **0 网络失败、0 控制台错误**。

但审计劈出两个**必须处理**的问题：

1. **首次进入的引导弹窗是个"假模态"** —— Esc 关不掉、Tab 会跑到背景导航、背景没被读屏屏蔽、开窗时焦点还停在页面上。它是每位新用户见到的**第一个界面**，走的却是全站唯一一处自绘浮层（同页的详情抽屉走共享组件，各项全对）。
2. ~~**「全部 (1729)」不是全部**~~ → **已修复（2026-09-23 晚）**：生产库里活跃作品 **1854** 条，页面原本只显示 **1729** 条，少 **125** 条（6.7%）。这 125 条 100% 是 **7 位已归档成员**的作品 —— 他们**归档那一刻本人就没有团队归属**，作品因此对**所有人**不可见，界面也无任何提示。已按「历史要完整」口径修复，接口与界面回到 **1854**（详见 H1-fix）。

另有一个移动端缺陷：375px 下分页底栏撑破页面，整页可横向滑动 67px（影响面仅此页）。

---

## 覆盖率

| 维度 | 已测 | 总览 | 说明 |
|---|---|---|---|
| 视图 | 2 / 2 | 100% | 全部（1729 条）、回收站（18 条） |
| 生命周期操作 | 3 / 3 | 100% | 移入回收站、恢复作品、永久删除（均到"确认前一步"，未提交） |
| 表头排序 | 12 / 12 | 100% | 全部可点，箭头方向逐列验证 |
| 表头/工具栏交互元素 | 66 / 66 | 100% | phase1 全量枚举 |
| 抽屉内交互 | 8 / 8 | 100% | 补录24h、恢复、永久删除、双列/单列、两张截图全屏、复制文案、关闭 |
| 筛选 | 6 / 6 | 100% | 选题库状态 ×3、负责人、账号、起始日期、关键词、重置 |
| 分页 | 3 / 3 | 100% | 页码、上一页/下一页、每页 20/30/50/100（实测切 50 → 50 行，共 35 页） |
| 深链 | 3 / 3 | 100% | `?videoId=` 有效 / 不存在 / `?view=trash` |
| 响应式 | 5 / 5 | 100% | 1440 / 1280 / 1024 / 768 / 375 |
| 键盘 | 22 焦点位 | 100% | 见 M3 |
| 场景 | 7 / 8 | 88% | 见下方「未测场景」 |

**未测场景及原因**

- **破坏性操作确认（Destructive Confidence）**：只到「就地确认横幅弹出 → 点取消」，**未提交任何写操作**。唯一例外是 H2 那次非预期触发（净零）。
- **重数据量（Heavy Data）**：本轮本身就是重数据 —— 1729 条作品 / 87 页，属真实生产规模，并非构造。无"空库"场景（回收站 18 条已覆盖小数据量）。
- **未覆盖**：`manage_videos` 被关闭的中间态角色（无此测试账号）；生产环境（Vercel）表现未测。

---

## 发现

### Critical

#### C1.（✅ 已修复 2026-09-23 深夜，见文末「修复记录」）首次进入的引导弹窗是"假模态"：Esc 无效、Tab 逃逸、背景未屏蔽、焦点不落窗内

- **现象**（全新会话首次进 `/admin/content`，实测）：
  | 检查项 | 结果 |
  |---|---|
  | 按 `Escape` | **关不掉** |
  | 连按 8 次 `Tab` | **8/8 全部跑到背景导航**（工作台 / 选题库 / 视频复盘 / 数据管理 / 管理中心 / 角标 / 用户菜单） |
  | 打开瞬间焦点在哪 | `BODY`（不在弹窗内） |
  | 背景是否对读屏屏蔽 | **否** —— 背景无 `aria-hidden`、无 `inert` |
  | 页面能否在弹窗后面滚动 | **能**（`body overflow: visible`） |
  | 标题关联 | 有 `<h3>欢迎使用视频复盘工作台</h3>`，但 `aria-labelledby` 为空、`aria-labelledby` 无法解析出标题 |
  | 无障碍名 | 只有 `aria-label`（`aria-modal="true"` 是手写的） |
- **根因**：`src/app/(app)/admin/content/content-page-client.tsx:603-654` —— **自绘 `fixed inset-0` 浮层**，没走共享 `ui/dialog.tsx`。全站弹层规范是"一律走共享组件"，这是页面上唯一一处例外。
- **对照（同一页、同一次会话）**：详情抽屉走 `ui/sheet.tsx`，`role=dialog` + `aria-modal` + 背景 `aria-hidden` + 滚动锁定 + 焦点陷阱（循环闭合）+ Esc 关闭 + 落焦刻意避开破坏性按钮 —— **全部通过**。反差证明不是"框架做不到"，是这一处没接。
- **为什么是 Critical**：它是新用户见到的**第一个界面**；而它的关闭按钮是页面上唯一的路 —— 键盘用户按 Esc 走不掉，读屏用户会被背景内容淹没。且只在首次出现（`localStorage: content-review-onboarding-seen`），**测过的老用户永远看不到它**，属于典型的"越早用过越碰不到"的缺陷。
- **证据**：截图 `10-first-contact-onboarding.png`、`11-onboarding-tab-escape.png`；`.acceptance/ux-audit-content-phase1.json` → `onboarding` / `onboardingEscCloses: false` / `onboardingTrapped: false`

### High

#### H1. 「全部 (1729)」不是全部：125 条历史作品在列表中消失，且无任何提示

- **现象**：生产库 `videos` 活跃作品 **1854** 条；`/api/admin/content/list` 与界面均返回 **1729** 条。差 **125** 条。
- **差集构成（全部核对过，无剩余）**：

  | 归档成员 | 作品数 | 账号 |
  |---|---|---|
  | 张继发 | 37 | 张继发 |
  | 高祎婧 | 30 | 高祎婧 |
  | 股建贝聿铭 | 26 | 股建贝聿铭 20 + 小鹅聊交易 6 |
  | 猎龙侦探 | 18 | 18 |
  | 张玥晗 | 11 | 11 |
  | 王东菊 | 2 | 2 |
  | 罗礼杰 | 1 | 1 |
  | **合计** | **125** | |

  这 7 人 `membership_status = 'archived'`，且**归档快照里 `archive_snapshot->>'team_id'` 为空**。

  > **口径更正（2026-09-23 晚复核）**：初版本报告把这一条写成"归档时漏填团队"。追生产库后推翻 —— **不是漏填，是归档那一刻这些人本人就没有团队归属**，快照忠实记下了 `null`。决定性证据：7 人的 `archived_by` **全部是阿禅本人**，归档原因均为「离职 / 已离职 / 重复身份」。也就是说，他们是本公司真实的历史成员，只是从未被分配过团队。
- **根因链（逐环取值复核）**：
  1. `src/lib/data-access-scope.ts:63-64` —— `inferDataScope()`：`if (groupMode && resolvedRole === "company_owner") return "all";` 否则 `company_owner → "team"`。**公司所有者在非集团模式下，数据范围是 `team`，不是 `all`**。
  2. `src/app/(app)/admin/content/content-page-client.tsx` → `ContentDataContainer` → `resolveAdminDataPerspective()`：`canUseCompanyPerspective`（= `perm.groupMode === true`）为 false 时固定返回 `perspective: "team"`。
  3. `src/lib/loaders/admin-content-page.ts:419-422` —— `filterRowsByDataScope(resolvedScope, allVideos, …)`。
  4. `src/lib/data-access-scope.ts:279-286` —— `filterRowsByDataScope`：`kind === "all"` 直接放行；**`team` 则逐行 `canAccessOwner`**。
  5. `src/lib/data-access-scope.ts:117-145` —— `loadCompanyVisibleRows()`：可见成员 = 该 team 的在职成员 **+ 仅当 `row.archive_snapshot?.team_id === teamId` 的归档成员**。
  6. → 这 7 人归档快照的 `team_id` 为空，`!== teamId`，**被排除**；而 owner 默认又不是 `all` 视角，于是这 125 条**对所有能进这个页面的人都不存在**。
- **影响**：管理者拿"全部"当作全量做复盘与趋势判断，实际样本缺 6.7%，且缺的是**完整的 7 个人**（不是随机缺），会系统性低估这几位的产出。
- **值得注意**：全员归档成员共 17 人，其中 10 人快照 `team_id` 有值（深圳二部 8 人 + 武汉二 1 人 + 重庆一 1 人），他们的作品**是可见的**。所以缺口不是"归档成员一律看不到"，而是"**归档时本人就没有团队**"的那批漏了 —— 是可见范围判定对 `team_id` 的依赖留下的边界，而非刻意策略。
- **✅ 已修复（2026-09-23 晚）**：口径裁定为「历史应该完整」。修改 `loadCompanyVisibleRows()`，在快照无团队时退回按**归档操作人所属公司**归属 —— 归档是管理动作，只能由被归档成员所属公司的管理者执行，故操作人所属团队即该成员历史产出的归属公司。见下方「修复记录」。
- **复现方式（只读）**：
  ```sql
  -- 库内活跃总数
  select count(*) from videos where lifecycle_state='active';            -- 1854
  -- 归档成员且快照无团队
  select id, name from profiles
   where membership_status='archived' and (archive_snapshot->>'team_id') is null;  -- 7 行
  ```
  再与 `GET /api/admin/content/list?view=all&scope=team` 返回的 `videos.length` 比对（1729）。
- **证据**：`.acceptance/content-api-videos.json`（接口全量 1729）、`.acceptance/db-active-videos.csv`（库全量 1854）、`.acceptance/content-missing-from-list.json`（差集 125）

#### H1-fix. 修复记录（2026-09-23 晚）

**口径裁定**（阿禅）：「历史应该完整，因为数据都是有用的」—— 离职成员的作品是真实数据资产，不该因为"归档时没分到团队"而从界面上消失。

**改法**：`src/lib/data-access-scope.ts` → `loadCompanyVisibleRows()` 增加归档成员归属的一级兜底。

| 情形 | 改前 | 改后 |
|---|---|---|
| 归档成员，快照 `team_id` 有值 | 快照团队 === 当前公司 → 纳入 | 不变 |
| 归档成员，快照 `team_id` 为 null | **一律排除 → 作品消失** | 退回按 `archived_by` 判定：归档操作人属于本公司 → 纳入 |
| 归档成员，快照属于其他公司 | 排除 | 不变 |
| 归档操作人不属于本公司 | — | 排除（不跨公司串数据） |

- 用 `archived_by` 而非"把无团队的归档成员一律放宽"，是为了**不引入跨公司泄露**：将来其他公司若出现"无团队归档成员"，其归档人不在本公司成员集里，不会被误纳入。二级兜底还支持"归档人本人后来也被归档"的情况（查其快照团队）。
- 该函数被两处共用 —— `buildDataAccessScope()` 的 `team` 分支（视频复盘等）与 `resolveCollaborationScope()` 的 `self` 放宽分支（数据管理模块）。这 7 人在**所有**受范围约束的模块同步恢复：视频复盘 125 条作品、日报 119 条（认证文案数为 0，不影响文案页签人数口径）。

**验证（真机登录 + 生产库对照，只读）**：

| 项 | 改前 | 改后 |
|---|---|---|
| `GET /api/admin/content/list?view=all&scope=team` | 1729 | **1854** |
| 与库内 `lifecycle_state='active'` 总数 | 1854（差 125） | 1854（**零差异**） |
| 基线 125 条差集的恢复率 | — | **125 / 125（7 人全部命中）** |
| 界面页签 | 全部 (1729) | **全部 (1854)** |
| 深链打开恢复的作品 | notFound | 正常渲染（账号 / 责任人显示「张继发」） |
| 数据管理页 `/admin/collaboration` | 正常 | 正常（无 JS 错误，页签人数口径未变） |
| 单测 / 类型 | 全绿 | **1797 项全绿**（含新增 1 项兜底回归用例）+ `tsc` 0 错 |

- **反向验证（无过度纳入）**：1854 = 1729 + 125，恰好等于缺口。易宇（武汉二）、阿Q（重庆一）等**其他公司**的归档成员快照里有团队，走"快照匹配"路径，不受兜底影响。
- **证据**：`.acceptance/content-api-videos-after.json`（改后全量 ID）、`.acceptance/ux-audit-content-fix-verify.mjs`（对照脚本）、截图 `90-after-fix-list.png` / `91-after-fix-drawer.png` / `92-after-fix-collaboration.png`
- **状态**：代码改动**未提交**，等授权。

#### H2.（✅ 已修复 2026-09-23 深夜，见文末「修复记录」）「恢复作品」一键即写，没有二次确认（同抽屉另两个操作都有）

- **现象**：`src/app/(app)/admin/content/content-detail-dialog.tsx:496-501` —— 「恢复作品」的 `onClick` 直接调用 `handleLifecycleAction("restore")`。而：
  - 「移入回收站」（`:531`）→ `setShowConfirmTrash(true)`，先弹就地确认横幅
  - 「永久删除」（`:516`）→ `setShowConfirmPurge(true)`，先弹就地确认横幅
  - **只有「恢复作品」没有确认步骤**
- **为什么要紧**：它的副作用写在自己的 toast 文案里 —— 「作品已恢复，**关联日报已复活**」。一次误点会同时改动作品状态和成员的绩效日报。
- **审计中的实证**：审计时对该按钮执行了一次点击（探针为取证按钮形态），**确实发出了写请求**（`PATCH /api/admin/videos/1b87998c-…/lifecycle`，见 `.acceptance/ux-audit-content-phase4.json` → `writeCalls[16]`）。
- **事后核查（生产库，净零）**：
  ```
  id     1b87998c-e85d-54e6-b684-f8b7c0c283a9
  title  农业走成主线
  lifecycle_state = trashed        （未变）
  trashed_at      = 2026-09-09 09:22:06+00   （未变，非本次时间）
  ```
  → 请求到达了服务端（dev 日志有该路由的首次编译记录），但**未生效**，详见 H3。
- **证据**：源码 + `53-restore-clicked.png`（点击后抽屉内**没有出现任何确认横幅**，与另两个操作对比明显）

#### H3. owner 点「恢复作品」请求发出但未落库，前端反馈未确认（需授权单测）

- **现象**：H2 那次点击的 `PATCH` 请求发出去了，数据库没变；抽屉里也没看到成功提示。
- **已排除**：不是"按钮 disabled"（`disabled={isOperating}`，初始 false）；不是"没发请求"（`writeCalls` 里有）。
- **代码疑点**：`src/lib/video-lifecycle.ts:43-54` —— 判定函数的三元表达式**两臂逐字相同**，是个失效分支：
  ```ts
  export function canOperateVideoWithinScope(actor, scope, ownerUserId) {
    void actor;
    const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
    return scope.kind === "all"
      ? activeVisibleUserIds.includes(ownerUserId)     // ← 分支 A
      : activeVisibleUserIds.includes(ownerUserId);    // ← 分支 B（与 A 完全相同）
  }
  ```
  无论 `scope.kind` 是什么，判据都是 `activeVisibleUserIds.includes(ownerUserId)`。若 owner 的 `activeVisibleUserIds` 不含该视频责任人，就会 `403 无权处理该作品`。
  > 这与已知的 `leaderboard.tsx:551-557`（涨/跌两臂同色）是**同一类失效分支**，建议一起收。
- **未定论的部分**：前端在 403 时应当走 `feedbackToast.error(错误文案)`（`content-detail-dialog.tsx:333-334`），但我的探针只读了抽屉内部文本，**没有抓到页面级 toast**，所以"用户是否能看到明确失败提示"这一条**没有拿到证据**。
- **下一步**：这是一条**写路径**验收，需单独授权（造临时数据 → 触发 → 核对 → 清理净零）。**不建议在只读授权下继续**。

### Medium

#### M1.（✅ 已修复 2026-09-23 深夜，见文末「修复记录」）375px 下分页底栏撑破页面，整页可横向滑动 67px

- **现象**：375px 视口下 `document.scrollWidth = 442`，`clientWidth = 375`，溢出 **67px**。表格本身有正确的内部横滚容器（`overflow-x: auto` ✓），**但分页底栏没有**，它把整页撑宽了。
- **越界元素（已逐层定位）**：
  ```
  <DIV class="flex items-center gap-3">            L=18  R=442  w=424   ← 分页底栏
    └ <DIV class="inline-flex items-center gap-1">  L=126 R=442  w=316   ← 页码组
      └ <BUTTON> "87"                               L=362 R=390  w=28
      └ <BUTTON> "下一页"                            L=398 R=442  w=44   ← 最右点
  ```
  它没有任何 `overflow-x: auto/scroll` 祖先，溢出直接传到 `<MAIN>` → `<BODY>`。
- **根因**：`src/components/ui/table-pagination.tsx:73` 外层**有** `flex-wrap`，但页码组（`:153` 附近）本身是 `flex items-center gap-1`，宽度 316px 硬性超过可用宽 347px 的容器内边距剩余空间 —— 子元素自身超宽，父级 `flex-wrap` 救不了。
- **影响面（好消息）**：`TablePagination` 全仓只有 `content-list.tsx` 一个调用点，**只影响视频复盘页**。
- **证据**：`80-w375-overflow.png`、`.acceptance/ux-audit-content-phase7.json` → `overflow375` / `chain`

#### M2. 深链失效页用「卷册 / 篇章」隐喻，用户不知道错在哪

- **现象**：访问 `/admin/content?videoId=<不存在的 ID>` → 404 页文案：
  > 「未找到对应卷册 / 此处的篇章可能已被归档收卷，或链接有微小出入。」+「回到工作台首页」
- **问题**：文案文采好，但**没有说出用户真正需要知道的事** —— 是"这条视频不存在"、"已彻底删除"、还是"我没有权限看"？三种情况动作完全不同（放弃 / 放弃 / 去申请权限），现在都只能"回首页"。
- **证据**：`61-deeplink-bad.png`

#### M3. 日期筛选键盘成本高，且第 4 个焦点位无焦点环

- **现象**：Tab 序列第 19–22 位连续落在 `开始日期`（`<input type="date">` 的年/月/日三个子字段），第 22 位 `focus-visible = false`。
- **影响**：键盘用户要按 6 次 Tab 才能穿过两个日期框，且其中一个无可视焦点。
- **性质**：主要来自浏览器对 date input 的默认实现（子字段逐个聚焦），产品侧可优化（如改为单一文本输入 + 日期选择器），但**不是实现错误**。此处只作记录。
- **证据**：`.acceptance/ux-audit-content-phase5.json` → `keyboard.seq[18..21]`

### Low

#### L1. 同一行表头混用两个字重（3 列 500 / 9 列 400）

- **现象**：`发布时间`、`播放量`、`涨粉` 三个表头按钮是 `font-medium`（500），`点赞 / 评论 / 分享 / 收藏 / 互动率 / 2s跳出 / 5s完播 / 均播 / 完播` 是 400。视觉上前三列"更重"。
- **根因**：`src/app/(app)/admin/content/content-list.tsx` —— `:558`、`:568`、`:578` 的 className 带 `font-medium`，其后 9 个 `handleSort` 按钮（`:589`…）没带。
- **证据**：`.acceptance/ux-audit-content-phase7.json` → `headerWeight`

#### L2. 抽屉打开后 URL 带上 `scope=team`，语义可疑

- **现象**：进入时 URL 是干净的 `/admin/content`；点开任一作品后变成 `/admin/content?view=all&scope=team&videoId=…`。
- **分析**：对 owner 而言这个参数**没有实际作用** —— `buildPermissionContextFromPermissionInfo()`（`current-permission-context.ts:165-196`）**完全忽略 `perspective` 参数**，只用 `teamId`。但对**有集团模式资格的人**，`?scope=team` 是有实义的路由状态。所以 owner 复制出的链接，在别人手里可能落到不同数据范围。
- **证据**：`.acceptance/ux-audit-content-phase2.json` → `urlAfterOpen`

#### L3. 已废弃的「投流 / 活动干预」选项仍留在渲染代码里

- **现象**：`content-page-client.tsx:552` 仍然渲染 `{boostedCount} 投流/活动干预`。当前 `boostedCount = 0` 所以不显示，一旦有数据就会冒出一项已拍板废弃的选项（阿禅 2026-09-22 已定全局废弃）。
- **证据**：源码；实测异常提醒条当前为 `167 异常 6 删稿 13 限流 50 腰斩`（合计 236 = 标题里的 236 ✓，桶相加与总数一致）

#### L4. dev 日志持续报 Node EventEmitter 泄漏警告

- **现象**：server 日志出现 11 次 `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 drain listeners added to [Gzip]`。
- **说明**：dev 模式下的告警，**未验证是否影响生产**。但审计期间该 dev server RSS 从 3.1GB 涨到 4.4GB（约 30 分钟），值得单独观察。

---

## 被推翻的假警报（本轮重要产出）

以下 7 项**曾表现为问题**，复验后确认不是产品缺陷。记录在此避免下轮重复排查。

| # | 现象 | 复验结论 | 复验方式 |
|---|---|---|---|
| 1 | 「发布时间」降序里混入了 5 月的老稿 | **误读截图**。实测前 20 行发布时间严格递减（09-22 → 09-21），字符串比较无逆序破绽 | `.acceptance/ux-audit-content-phase2b.json` → `sortCheck` |
| 2 | 点「复制文案」提示「复制失败，请重试」，且 toast 里带着 React 组件堆栈 | **headless 剪贴板权限被拒**。给 context 授予 `clipboard-*` 后：toast「文案已复制到剪贴板」、按钮变「已复制」、剪贴板内容 360 字 ✓ | `42-copy-after-grant.png` |
| 3 | 「单列大图」「全屏放大预览」按钮找不到 | **探针缺陷**（误用时含全角逗号的 CSS 属性选择器）。改用属性取值比对后：布局切换真实生效（`md:grid-cols-2` ↔ `flex flex-col`），全屏预览 `role=dialog` + `aria-modal` + 滚动锁定 + Esc 关闭 + ←/→ 切图 `(1/2)→(2/2)` 全通过 | `.acceptance/ux-audit-content-phase3b.json` |
| 4 | 抽屉 Tab 到第 9 位时焦点跳到 `inDialog=false` 的 SPAN → 疑似焦点陷阱失效 | **那是陷阱哨兵元素**。第 10 位回到第 1 位（「移入回收站」），循环闭合，陷阱成立 | 同上 → `tabSeq` |
| 5 | 点开抽屉后立刻探测 DOM 完全找不到 | **`dynamic(ssr:false)` 首开需要加载 chunk**。实测首次开抽屉 337ms、二次 69ms，属正常 | `.acceptance/ux-audit-content-phase3.json` → `firstOpenMs` |
| 6 | 点「回收站」/「移入回收站」时 `Execution context destroyed`，疑似真实页面导航 | **HMR 重载**。审计期间**另一代理正在修改 `src/app/(app)/admin/collaboration/*` 并新建 `mom-change-format.test.ts`**（`git status` 证实），文件变动触发 dev Fast Refresh 重载页面 | `git status --short` 前后对比 |
| 7 | owner 进页面 URL 出现 `scope=team`，疑似被降级到某个团队 | **视角模型如此，非缺陷**（但归档成员那 125 条是真问题，见 H1）。owner 数据范围由 `inferDataScope()` 决定，与 URL 无关 | `admin-data-perspective.ts` + `data-access-scope.ts` 通读 |

---

## 按线程走查结果

### 线程 1：早上盘昨天的异常稿（主要用法）

落地 `/dashboard` → 顶栏「视频复盘」→ 列表首屏 20 行 → 顶栏提醒条「**异常提醒 (236)**」+「最需关注: 曾文聪(限流)、董效龙(删稿)」两个可点名字 +「**直接去盘 →**」。

- **入口 1 次点击** ✓
- 提醒条把"有多少异常、都是哪一类、最该先看谁"一次说清，且各桶数字相加 = 标题总数 ✓
- 「直接去盘 →」的 title 写明靶子口径（`打开昨天发布的异常作品；昨天没有异常时打开最近 7 天的异常，再没有才回到存量最需关注`）—— 这种"把内部规则摊开给用户"的做法值得保留
- 点开抽屉：4 个核心指标卡（播放量 / 转粉率 / 互动率 / 点赞率）各带达成率与评级（`优106%` / `差23%` / `优199%`），10 项快照明细，两张截图（流量曲线 + 留存脱落），文案库 360 字带复制
- **结束是否明确**：是。点「复制文案」有 toast + 按钮变「已复制」；Esc 关闭抽屉后 URL 自动去掉 `videoId`
- **一条能省一半力的事**：抽屉里「流量曲线截图」当前只有「点击全屏放大」这一种展开方式。截图证据区在抽屉里是折叠的（`<details>`），默认展开但高度受限（`max-h-[460px]`），**要看完整曲线必须逐张全屏**——若能在抽屉内给一个"曲线 + 关键节点标注"的缩略概览，这次复盘的主要动作就不用跳出去

### 线程 2：写一份复盘（打开作品 → 拿文案）

打开作品 → 「视频文案内容库 (360 字)」→「复制文案」→ toast「文案已复制到剪贴板」。**2 步到底** ✓

### 线程 3：清理回收站

「回收站 (18)」→ 点开一条 → 抽屉顶部出现「恢复作品」+「永久删除」→ 抽屉内一行说明：「作品处于回收站保护期：移入未满 30 天，可于 2026/10/9 17:22:06 之后执行彻底物理销毁。」

- **这条说明写得好** —— 直接给出不可用原因**和解除时间点**，不用用户去猜
- 「永久删除」的 `title` 也带同一信息；按钮在保护期内 `disabled`
- **缺陷**：见 H2（「恢复作品」无确认）、H3（点击后是否给出失败反馈未定论）

### 线程 4：筛出某人的作品

「全部负责人」下拉 → 选人；「全部账号」下拉 → 选账号；「开始日期 / 结束日期」+「搜索标题或文案」+「重置」。搜索无结果时空态文案：「**当前筛选条件下没有视频 / 请调整筛选条件，或点击"重置"查看全部视频**」✓ 给了下一步动作，不是"暂无数据"。

---

## 场景电池结果

### 1. First Contact
- 从零开始：靠顶栏「视频复盘」1 次点击进入 ✓
- **引导弹窗存在但帮不上忙** —— 它讲了三步（先看异常与指标 / 截图对照 / 闭环处理），内容方向正确；但互动层面是 C1 那个假模态。**内容够用，容器不合格。**
- 页面自解释：`全部 (1729)` / `回收站` / `异常提醒 (236)` / `选题库状态: 全部作品·已入选题库·已移出` 都能望文生义
- 需要停下来想的地方：「选题库状态」筛选在列表上方、与「全部作品」在同一条内，但它筛选的对象是**这条作品有没有进选题库**——不看源码时首次确实顿了一下

### 2. Interrupted Workflow（中断恢复）
| 方式 | 结果 |
|---|---|
| 切到回收站后 F5 | ✓ 完整保留（`?view=trash&scope=team` → 刷新后仍是回收站，18 行） |
| 打开作品后 F5 | ✓ 完整保留（`?videoId=` 深链直接还原抽屉） |
| 浏览器返回键 | ⚠ 设计权衡：切 view / 选作品用 `pushState`+`replaceState` 镜像 URL，`loadData` 走 `replaceState`（不入历史）→ 按返回键会**直接离开视频复盘页**而不是退回上个视图 |

### 3. Wrong Turn Recovery
- 误点「回收站」→ 点「全部 (N)」1 次点击回退 ✓
- 误点日期筛选 → 「重置」1 次清空全部筛选 ✓（实测关键词与日期一并清空）
- 误开抽屉 → Esc 或点右上「关闭」均可 ✓

### 4. Returning User
- 列表默认按发布时间降序，重进直接是昨日稿件在最上 ✓
- 无"上次访问后有什么变化"的提示（本页定位是检索而非动态流，可不做）

### 5. Keyboard Only
- 22 个焦点位**全部**有 `focus-visible` 焦点环（唯一例外是 `input[type=date]` 的内部子字段）
- Tab 顺序与视觉顺序一致：顶栏导航 → 用户菜单 → 视图切换 → 提醒条内可点名字/按钮 → 选题库状态 → 下拉 → 日期 → 搜索 → 重置 → 表头排序 → 表格行
- **表格行本身不可 Tab**（整行和「查看 →」都是 `onClick`，无 `tabindex`）→ 纯键盘用户**无法打开任何作品详情**。这是纯键盘路线上的实际断点，附在这里一并报告（与 M3 同属键盘域）。
- 抽屉内：陷阱闭合、Esc 可关 ✓

### 6. Heavy Data
- 真实规模 1729 条 / 87 页 ✓
- 每页 20/30/50/100 全档可用（实测切 50 → 50 行、共 35 页）
- 列表整包下发（模块地图记载的未修性能债：库内字段体量粗估 4–7MB、批次内无二次分页、offset 分页无 id 去重）—— 本轮未做性能专项测量，不作结论

### 7. Destructive Confidence
- 「移入回收站」：就地确认横幅，文案「确认移入回收站？该作品将隐藏，关联的成员绩效日报将同步作废。」✓ 说清了副作用
- 「永久删除」：就地确认横幅 + 保护期说明 + `disabled` ✓
- 「恢复作品」：**无确认**（H2）
- 三者都**不叠第二层遮罩**（就地切换）✓ 符合规范

### 8. Second User（受限角色）
组员 `test-member@dydata.test` 打开 `/admin/content`：

> 「需访问权限 / 还没有「视频复盘」权限 / 该功能属于系统受控模块，当前仅对组长 · 管理开放。如有业务需要，请联系公司所有者或组长开通对应权限。」+「申请查看权限」+「返回工作台」

- **这是全站权限拒绝文案里做得最好的形态之一**：说清"为什么不行 / 谁能开 / 我该怎么办 / 两个可点动作"
- 侧边导航的「视频复盘」入口对组员**不出现** ✓
- 强推 `?view=trash` 同样落到权限页，不泄露任何数据 ✓
- 回收站 tab 对无 `manage_videos` 的用户不渲染 ✓

---

## 网络与控制台

| 项 | 结果 |
|---|---|
| 请求失败（≥400） | **0**（跨全部 7 个阶段） |
| 控制台 error | **0** |
| pageerror | **0** |
| 关键接口 | `GET /api/admin/content/list?view=all&scope=team` → 200（1729 条）；`?view=trash` → 200（18 条） |
| 选题库状态批量查询 | `POST /api/admin/content/topic-library-status` × N（1729 条 → 按 400/批 → 5 批，符合"客户端必须分批再合并"的约束） |
| 写请求 | 仅 1 条非预期的 `PATCH …/lifecycle`（H2，已核查净零） |
| 服务器日志 | 11 次 `MaxListenersExceededWarning … [Gzip]`（L4） |

---

## 做得好的地方（建议保留）

1. **详情抽屉的模态实现是标杆**：`role=dialog` + `aria-modal` + 背景 `aria-hidden` + 滚动锁定 + 落焦到容器（**刻意避开"移入回收站"**，源码注释写明原因）+ 焦点陷阱闭合 + Esc —— 每一条都实测通过。把 C1 的引导弹窗改成同一个组件，问题即消。
2. **破坏性操作就地确认**：横幅在抽屉内切换，不叠第二层遮罩；「移入回收站」的确认文案主动交代了"关联日报将同步作废"这个隐藏副作用。
3. **回收站保护期说明**：给出不可用原因**和**解除时间点（`可于 2026/10/9 17:22:06 之后执行彻底物理销毁`），不用用户猜。
4. **权限拒绝页**：原因 + 谁能开 + 申请入口 + 返回入口，四件齐全。
5. **空态给下一步**：搜索无结果时说"或点击重置查看全部视频"，而不是"暂无数据"。
6. **异常提醒条的自洽**：各桶数字相加 = 总数（167+6+13+50 = 236），且源码注释记载了历史上"总数 68、明细 69"的对账 bug 已通过共用分类函数根治。
7. **`title` 属性承担了术语解释**：「直接去盘 →」把靶子口径摊开写；表头「有效作品 / 优秀作品」在达人页有口径提示（注：本轮聚焦视频复盘，未复核数据管理页的一致性——那是上一份审计 M4 的题目）。
8. **零网络失败、零控制台错误**，全流程干净。

---

## 修复记录（2026-09-23 深夜：C1 / H2 / M1）

三项均已改完并在真机复验通过（本地 dev + 真实 Chromium + 真实登录态），全站 **1797 项单测 + `tsc` 全绿**。**未提交**。

### C1-fix. 引导弹窗改走共享弹层

- **改动**：`content-page-client.tsx` —— 删掉自绘 `fixed inset-0` 浮层，整块换成 `ui/dialog.tsx` 的 `Dialog / DialogContent / DialogTitle`；`DialogTitle` 承载可解析的 `aria-labelledby`，`onOpenChange` 统一收口到既有 `handleDismissOnboarding`（Esc / 点外部 / 关闭都会写入 `content-review-onboarding-seen`）。三条说明与按钮文案、样式原样保留。
- **真机复验**（`.acceptance/ux-audit-content-fix2-verify.json`、截图 `92/93`）：

  | 检查项 | 改前 | 改后 |
  |---|---|---|
  | `role=dialog` + `aria-labelledby` 能解析出标题 | ✗（仅手写 `aria-label`） | ✓「欢迎使用视频复盘工作台」 |
  | 连按 10 次 `Tab` | 8/8 逃到背景导航 | **0/10 逃逸** |
  | 背景对读屏屏蔽 | ✗ | ✓ 背景兄弟节点 `aria-hidden="true"` |
  | 弹窗打开时页面滚动 | 能滚 | **锁定**（滚动前后 `scrollY` 未变） |
  | `Escape` | 关不掉 | **关闭 + 标记写入** |

- 注：base-ui `Dialog` 不设 `aria-modal`（全站一致），不以该项为缺口。

### H2-fix. 「恢复作品」补二次确认

- **改动**：`content-detail-dialog.tsx` —— 新增 `showConfirmRestore` 就地确认横幅（与「移入回收站」「永久删除」同位置、同形态、同「暂保留 / 确认」结构）；入口按钮改为只开横幅；恢复与彻底删除两条横幅互斥；`handleLifecycleAction` 成功后统一复位。
- **真机复验**（`.acceptance/ux-audit-content-fix2b-verify.json`、截图 `98`）：
  - 点「恢复作品」→ **发出写请求 0 条**（改前为 `PATCH …/lifecycle`），横幅出现：「确认恢复该作品？将重新出现在列表中，并复活关联的成员绩效日报。」
  - 点「暂不恢复」→ 横幅消失，仍 0 写请求。
  - 「确认恢复」复用原有 `handleLifecycleAction("restore")` 路径，逻辑未改；**该分支未做真机落地验证**（会真实改动生产数据，需单独授权，见 H3）。

### M1-fix. 窄屏分页底栏收口

- **改动**：`src/components/ui/table-pagination.tsx`（全仓仅 `content-list` 一处引用）—— 右侧「页容量 + 翻页」组加 `flex-wrap` + `min-w-0`；`<640px` 隐藏「上一页 / 下一页」文字只留箭头（两按钮本就有 `aria-label`）。
- **真机复验**（`.acceptance/ux-audit-content-pagination-widths.json`、截图 `99c-pagination-375/320`）：

  | 宽度 | 改前 | 改后 |
  |---|---|---|
  | 375px | `documentElement.scrollWidth` **442**（溢出 67px）、8 个越界元素 | **375 = 视口**、越界 0、分页条容器 347px 全在视口内 |
  | 320px | 未测 | **320 = 视口**、越界 0 |

  - 翻页按钮 30×28（未被压成竖排）；分页条自身 `scrollWidth == clientWidth`（无内部溢出）。

### 本轮验证踩到的一个环境坑（下轮复用）

- 首次跑到「点恢复按钮后没有横幅」时，一度按「代码没生效」处理。实为 **dev server 未把 dynamic import 的组件热更成新版** —— 重启 dev server 后同一脚本立刻通过。**结论：改完 `dynamic()` 加载的组件，验收前必须重启 dev server，别信 HMR。**

---

## 优先修复建议

| # | 建议 | 对应 | 成本 |
|---|---|---|---|
| 1 | ~~引导弹窗改走 `ui/dialog.tsx`~~ → ✅ **已修**（2026-09-23 深夜）：整块换成共享 `Dialog` + `DialogTitle`，Esc / 焦点陷阱 / 背景 `aria-hidden` / 滚动锁定 / `aria-labelledby` 全部到位（真机复验 5/5） | C1 | 已完成 |
| 2 | ~~归档成员快照缺 `team_id` 的 125 条作品：决定口径~~ → ✅ **已修**（2026-09-23 晚）。口径裁定「历史要完整」；`loadCompanyVisibleRows()` 快照无团队时按归档人所属公司兜底纳入。125/125 恢复，接口 1729 → 1854 | H1 | 已完成 |
| 3 | ~~「恢复作品」补就地确认横幅~~ → ✅ **已修**（2026-09-23 深夜）：新增 `showConfirmRestore` 就地横幅（与另两个生命周期操作同规格），点击后**不再直接发写请求**（真机复验：0 写请求） | H2 | 已完成 |
| 4 | 写路径单独验收一次：确认 owner 点「恢复作品」的真实状态码与前端提示（含 `canOperateVideoWithinScope` 那个两臂相同的三元） | H3 | 小（需授权） |
| 5 | ~~分页底栏在窄屏收口~~ → ✅ **已修**（2026-09-23 深夜）：右侧翻页组加 `flex-wrap` + `min-w-0`，`<640px` 隐藏「上一页 / 下一页」文字只留箭头。375px / 320px 均零横向溢出、零竖排（真机复验） | M1 | 已完成 |
| 6 | 深链失效页把隐喻换成可操作说明（"该作品不存在、已彻底删除，或你没有查看权限"） | M2 | 小 |
| 7 | 统一表头按钮字重（补齐后 9 列的 `font-medium` 或去掉前 3 列的） | L1 | 极小 |
| 8 | 清掉「投流 / 活动干预」残留渲染 + `canOperateVideoWithinScope` 的失效分支（与 `leaderboard.tsx:551-557` 一起收） | L3 / H3 | 小 |
| 9 | （可选）让表格行可 Tab，或给「查看 →」加可聚焦语义，补上纯键盘打开详情的路径 | 场景 5 | 中 |

---

## 未验证 / 待补

- **写路径全链路**（移入回收站 / 恢复 / 永久删除的真实提交与净零核对）—— 只读授权下未做。建议单独排一次净零冒烟。
- **生产环境（Vercel）表现未测**：本轮为本地 dev，冷编译耗时（首屏 16.5s）不代表线上；H1 不依赖环境，与数据量正相关。
- **`archive_snapshot.team_id` 为空的历史成因**：已查明（2026-09-23 晚）—— **不是归档流程漏写，是这 7 人归档那一刻本人就没有 `team_id`**，快照忠实记 `null`。归档人全部是阿禅本人，归档原因为「离职 / 已离职 / 重复身份」。故不存在"归档流程待修"的前置问题；已在可见范围判定侧按归档人归属兜底修复（见 H1-fix）。
- **列表整包性能**（4–7MB 下发 / 无 id 去重）未做专项测量。
- **数据管理页（`/admin/collaboration`）的 M4 待办**（运营/剪辑页签缺「有效作品/优秀作品」tooltip）本轮未复核 —— 见 `docs/ux-audit-2026-09-23.md`。

---

## 环境说明（影响可复现性，务必留意）

1. **本仓审计期间有并发写入**：另一代理正在改 `src/app/(app)/admin/collaboration/*` 并新建测试文件。这触发 dev Fast Refresh 重载页面，是本轮多次 `Execution context destroyed` 的来源（假警报 #6）。**在同一工作区做浏览器验收时，务必把 HMR 重载与产品行为区分开。**
2. **审计开始前重启了 dev server**：旧 server 已跑 9 小时 35 分、RSS **7.06GB**（工作记忆记载的"老化 dev server 会让验收失效"阈值），本轮的 server 为新起，RSS 3.1→4.4GB。
3. **截图 1:1**：`deviceScaleFactor: 1`，1440×900 输出即 1440×900，无需 downsample。
4. **原始数据**：`.acceptance/ux-audit-content-phase{1,2,2b,3,3b,4,5,6,7}.json` + `.acceptance/content-api-videos.json` + `.acceptance/db-active-videos.csv`。
   > `.acceptance/` 整目录被 `.gitignore` 忽略，其中的登录态 token 不随仓库提交。若需留档，先复制到 `docs/ux-audit-screenshots-content-2026-09-23/` 再提交。
