# UX 审计：DYData 发布履约（/admin/fulfillment）＋ 行动中枢

**日期**: 2026-10-06
**URL**: http://localhost:3000（本地 dev；按任务约定未访问生产站）
**Persona**: 阿禅 — 公司负责人，每天看发布进度、谁没交，处理补交申诉；习惯从导航栏"今日待办"（铃铛）进审批。聪明但不写代码，时间紧，桌面 1440×900 为主。
**Browser**: Playwright 1.62.1（headless chromium，viewport 1440×900，deviceScaleFactor 1），探针脚本与原始产物 `output/ux-audit-20261006/B-fulfillment/`
**审计分片**: B-fulfillment（/admin/fulfillment 全部 + UnifiedCommandHub 待办抽屉/豁免审批列表/角标计数）
**账号**: 组长 test-leader@dydata.test（admin，DB 核实 permissions 不含 manage_members）；组员 test-member@dydata.test（member）；阿禅 1305085564@qq.com（owner，仅只读核验）
**数据纪律**: 自造申诉 2 条均带标记「审计B-20261006-0039（批准演练）/ 0050-REJECT（驳回演练）」；对 测试组员 的一次"标为请假"改判已通过 remove 接口完全撤销（DB 归零）；审计A、阿禅的预存申请一律未触碰。

## Summary

发布管理工作台本体（统计卡/矩阵/筛选）完成度高，但补交审批链路发现 1 处 Critical 前后端断裂（工作台申诉列表接口 405 被静默吞掉，列表永久为空）与 2 处 High（组员侧审批结果通知发到了无 UI 消费点、5 秒撤回窗内导航导致审批提交静默丢失）。**任务关注的 10-05 审批修复本身经真实点击终验通过**：批准与驳回两条完整链路的三层结果（审计落库/员工通知/待办关闭）全部 succeeded 并经生产只读 DB 逐行核验，p_reason 驳回理由落库回归修复界面行为正确。

## Coverage

| 维度 | 实测 | 盘点 | % |
|------|------|------|---|
| 区域（路由/面板） | 4/4（工作台、行动中枢 3 页签、组员侧、登录） | 4 | 100% |
| Threads | 5 | 5 | 100% |
| 场景组合 | 7（Heavy Data 未灌库，用现有 27 人×31 天观察并登记） | 8 | 88% |
| 独立交互控件 | 47 | 62 | 76% |

**未测控件（15/62）及原因**：
- 行动港"同意补交/驳回"按钮（2）——因 C1 申诉列表永远为空，成为渲染不出的死代码
- 飞书催交开关（1）——组长显示"企业统一配置"只读态，需系统管理员权限
- "一键全部同意"（1）——会连带审批审计A与阿禅的预存申请，按数据纪律不点
- 历史页签"打回"按钮（1）——历史列表在 dev 下 >60s 停留加载态，未能到达
- 组员侧"申请补交"表单链路（3）——需 >72h 旧视频+截图等数据前提，改用会话内直调同源 API 建申诉（已在文中登记偏差）
- 批量标记 3 种状态的提交（3）——只验证弹窗文案，未提交以免污染预存数据
- 成员抽屉内改判按钮逐个验证（4）——只验证打开/关闭与行动港改判主路径

## Findings

### Critical（阻断任务）

- **C1 申诉列表接口 405，工作台"待审补交列表"永久为空且静默失败**
  - *现象*: 每次加载 /admin/fulfillment，前端调 `GET /api/admin/fulfillment/appeals?limit=150` → 405 Method Not Allowed（4 个独立会话复现：00:29 / 01:13 / 01:15，每次 1-2 条）；`fetchAppeals` catch 后仅 console.error 并 `setAppeals([])`，界面无任何报错，行动港显示"0 条补交待审 / 已全部归档"，统计卡显示"已全部清空"。dev 工具面板倒是显示"2 Issues"（405），但普通用户看的是业务界面。
  - *影响*: 管理员在发布管理页完全看不到待审申诉，无法从工作台审批；fulfillment-action-dock 里的"同意补交/驳回"按钮成为永远渲染不出的死代码。有真实待审申诉时界面依旧谎报"0 条"（01:15 会话实测：申诉待审期间工作台仍显示 0）。只剩导航铃铛一条路可审批。
  - *根因*: commit `de86438c`（2026-10-05 11:34，"test: unify mutation contract exits and add coverage guard"）在重构 mutation 契约时把 route.ts 中整个 `export async function GET` 连同辅助函数一并删除；POST（成员提交申诉）保留。前端 `fetchFulfillmentAppeals` 对 405 空响应体做 `res.json()` 还会抛 SyntaxError。
  - *Where*: `src/app/api/admin/fulfillment/appeals/route.ts` ＋ `src/lib/fulfillment/data/workbench.ts`（fetchFulfillmentAppeals）＋ `fulfillment-workbench-state.ts`（静默吞错）
  - *Screenshot*: 23-dock-expanded.png、38（405 期间工作台仍显示 0）；原始记录 raw/p2b-thread1-monitor.json、raw/p6b-extras-monitor.json
  - *Fix*: 从 `git show de86438c^:src/app/api/admin/fulfillment/appeals/route.ts` 恢复 GET 处理器；同时 catch 不应静默——行动港需要"申诉列表加载失败"错误态。

### High（困惑/信任损伤）

- **H1 组员永远看不到审批结果：结果通知发到了没有任何 UI 消费的"feed"分类**
  - *现象*: 驳回托盘承诺"驳回原因将通过通知直接发送给成员"；服务端确实写入通知行（DB 实测 unread，warning，"补交申请已驳回。驳回原因：……"）。但该通知 category=feed，而：action-center 摘要只查 category=todo；全部源码中无任何组件读取 feed 通知；组员铃铛抽屉只有"团队待办"页签（实测"共 0 项待跟进"）；dashboard 全文扫描无"已通过/已驳回/驳回原因"任何痕迹（实测全 false）。
  - *影响*: 组员提交补交后不知道批没批、为什么被驳、要不要重新交——审批闭环的员工侧断链。批准通知里的"去上传数据"行动入口（resumeAppeal）也因此无人能发现。
  - *Where*: `appeal/handle/route.ts`（emit category:"feed"）＋ `lib/action-center/server.ts`（listOpenTodoSummaryForUser 只查 todo）＋ 无 feed 消费组件
  - *Screenshot*: 73-member-dash-after.png、74-member-hub.png；DB 证据见「补交审批真实点击终验结果」
  - *Fix*: 结果通知改发 category=todo（或让组员侧摘要把 fulfillment_appeal_result feed 纳入）；或在组员 dashboard 加"我的补交申请状态"卡片。

- **H2 5 秒撤回窗内的审批提交会被页面刷新静默取消，且无任何失败提示**
  - *现象*: 点击"同意补交/确认驳回"后并不立即发请求，而是进 5 秒撤回缓冲。实测一次驳回：确认后 ~1s 页面发生一次导航（同 URL），缓冲通过 pagehide flush 走 sendBeacon——请求发出但被中断（Playwright 记录到请求、无响应），服务端未收到（DB 仍 pending、无 audit_logs 行），UI 无失败 toast、卡片保持已移除状态。管理员以为驳回成功了。
  - *影响*: 确认过的审批操作变成"可能提交了也可能没有"，下次打开抽屉申诉又回来了，无任何解释。真实用户关标签页/切路由同样触发此窗口。
  - *Where*: `unified-command-hub.tsx` scheduleAppealReviewWithUndo（5s setTimeout）＋ flushPendingUndoReviews（sendBeacon/keepalive）＋ `commitAppealReview`（失败才恢复卡片，取消型失败无感知）
  - *Screenshot*: raw/p4d-reject-final-monitor.json（01:03:07 POST 无响应）；干净重试对照见 p5（200 rejected）
  - *Fix*: 确认即提交（服务端已有"打回/reopen"机制承担反悔）；至少在 visibilitychange/pagehide flush 失败时保留本地待重发队列并在返回时提示。

- **H3 补交申诉的"能审批的人"与"会被提醒的人"口径不一致**
  - *现象*: 申诉待办通知的接收人过滤为 owner 或 `permissions.manage_members===true` 的 admin（DB 实测本环境组长 admin 不含该权限，收不到申诉待办）；但行动中枢审批页签对普通 admin 照样列出申诉卡片，审批接口只要 owner/admin role 即可通过（组长实测成功批准+驳回）。同时角标计数中 fulfillment 来源是硬编码零查询适配器（`loadFulfillmentActionSource` 恒 0），申诉永不进角标——对收不到待办的管理员，角标+待办+工作台三处全部无提示。
  - *影响*: 一类管理员有审批权却永远无感知，只会在"恰好打开抽屉"时才发现申诉积压；阿禅（owner）能收到待办所以无感——问题只在中间角色暴露。
  - *Where*: `api/admin/fulfillment/appeals/route.ts`（recipients 过滤）＋ `lib/action-center/server.ts`（loadFulfillmentActionSource 恒 0）＋ `appeal/handle/route.ts`（requireOwnerOrAdminRole）
  - *Fix*: 三处口径对齐：要么申诉待办发给所有可审批角色，要么审批入口同样要求 manage_members。

### Medium（可工作但不佳）

- **M1 "自定义"时间档位是死档位**：点击"自定义"胶囊后无任何日期选择器（实测 dateInputs=0），仅显示"当前范围：自定义时间段"，与"本月"行为无差别。Where: filter-bar.tsx。Screenshot: 11-preset-custom.png
- **M2 日历重载期间整个矩阵卸载，排序/展开状态丢失**：切换预设或月份时矩阵区整体替换为"正在刷新日历数据..."，FulfillmentMatrixRoster 卸载重挂，sortMode/expanded 等 useState 全部重置为默认（代码确认 + 卸载现象实测）。dev 单次重载 2.5~57s（dev-mode 观察，不下性能定性），但状态丢失与速度无关。Screenshot: 10-preset-上月.png
- **M3 移动端（375px）：页面横向溢出 + 行动中枢入口消失**：scrollWidth 451 > 375（矩阵 31 列溢出 ~76px）；更关键的是顶部导航只余 logo，底部变成 App 式 tab（工作台/…/我的），铃铛（行动中枢）入口不存在——"负责人在手机上看谁没交、处理申诉"这一 persona 核心场景在手机上不可达。768px 无溢出、抽屉正常。Screenshot: 84-responsive-375.png
- **M4 已处理记录页签长时间停留加载态**：两次会话（p3d、p5）切到"已处理记录"后 >60s 停留"正在加载历史记录...共 0 条记录"，`/api/exemptions/history?limit=50` 请求发出且无 >=400 响应——dev-mode 观察＋疑似慢查询/渲染问题，打回（reopen）按钮因此未能实测，需在非 dev 环境复核。Screenshot: 72-history-rejected.png
- **M5 批量标记弹窗未披露可逆性与后果**：文案"您正在将已选的 N 位成员今日记录标记为「X」"具体（人数+动作），但确认按钮为普通主按钮样式（无警示色），未说明是否可撤销（单条改判有 5s 撤销 toast，批量没有）；"备注原因（选填）"与批量请假/豁免的严肃度不匹配。未实际提交（数据纪律）。Screenshot: 83-batch-dialog.png
- **M6 驳回托盘中按 Esc 无效，与页脚"Esc 关闭"承诺相悖**：键盘 R 打开驳回托盘后 textarea 自动聚焦，hub 的全局快捷键守卫忽略 textarea 事件，托盘自身无 Esc 处理——实测 Esc 后托盘仍开（openAfterEsc=true），只能点"取消"。Screenshot: 61-esc-ineffective.png

### Low（打磨）

- **L1 时间预设切换不回写 URL**：URL 不随 今天/本月/上月 变化（服务端本支持 ?range=），无法收藏/分享视图。
- **L2 "待处理审批"筛选空态文案错位**：点统计卡"待处理审批"后行动港空态显示"当前指标筛选下无异常成员"——用户关心的是申诉不是成员。Screenshot: 25-pending-filter.png
- **L3 申诉卡"缺勤 N 天"对异常类申诉恒为 0**：异常通道建的申诉卡显示"缺勤 0 天"，但该成员实际断更多日，审批者会误读。Screenshot: 50-appeal2-card.png
- **L4 矩阵行徽章"断更 0%""断N天"措辞堆叠**："断更"是梯队标签、"0%"是达成率、"断N天"是连续天数，三个"断"字并排读起来歧义。

## Thread Results

### Thread ①: 按日期/团队筛选查看进度与未交名单
- **可完成**: 是（M1/M2 减分）。点击数：落地即见全貌；每项视角切换 1 次点击。
- **决策点**: "自定义"死档；"上月"后矩阵区整个变 spinner 需盲等。
- **实测**: 团队选项 [全部团队, 深圳二部]；三档排序首行确实变化；统计卡"连续断更预警/待处理审批"点击联动指标筛选，出现"清除指标筛选 ×"；"点击快速排查→"可用。
- **结束清晰度**: 好——4/162 条应发、27 人预警、0 待审一眼可读。
- **Screenshots**: 02 / 10-11 / 20-25

### Thread ②: 自造补交申诉 → 界面完整批准 → 三层结果
- **可完成**: 是——但只能走铃铛（工作台被 C1 废掉）。申诉创建走组员会话直调界面同源 API（表单路径需 >72h 旧视频+截图数据前提，登记偏差），标记「审计B-20261006-0039」，9 位管理员收待办。
- **路径**: 铃铛 → 待审批申请 → 补交申诉卡（成员/账号/业务日期/事由/缺勤天数齐全）→ 同意补交 → 撤回条 5s → 自动提交 → 200 {status:approved, 三态 succeeded}。
- **三层结果**: DB 全验证 ✅（见下专节）。
- **点击数**: 2 次点击（铃铛、同意）；决策点 0。
- **Screenshots**: 32 / 33 / 35；监控 raw/p3b

### Thread ③: 驳回路径 + 理由必填 + 组员侧可见反馈
- **可完成**: 审批侧是；组员侧反馈不可达（H1）。
- **实测**: 空理由点击 → 行内报错"请填写具体的驳回原因"（错误优先式，非禁用态）；理由落库 decision_reason 完整；9 条待办关闭；audit_logs 落行。首次尝试被 H2 吞掉，干净重试成功。
- **Screenshots**: 50-52 / 61-62 / 65

### Thread ④: 重复处理同一申诉（幂等）
- **后端**: 重复 approve / reject 均 200 {status:"already_handled", 三态 skipped}，无副作用 ✅
- **界面**: 申诉处理后即从待审消失，无重复处理入口（天然防重）；已处理历史中的"打回"是唯一重开通道（因 M4 未实测）。

### Thread ⑤: 行动中枢抽屉：角标/强制刷新/计数
- **打开即强制刷新** ✅：每次 open 实测重发 /api/exemptions/pending（2 连发）。
- **角标** = summary.todoCount = 待办通知 + 豁免审批数 + 0(fulfillment 恒 0) + 孤儿数。补交申诉不计入角标（对组长实测恒不变；H3）。
- **批准后计数**: 申诉 todo 标记 done 正确，但角标对组长无感（申诉本就不在其角标内）；对 owner 的 +1/-1 未能在安静环境观测（共享 dev 环境有审计A并行写入，数据噪声已登记）。
- **键盘**: 1/2/3 切页签、J/K 选卡、A 同意、R 驳回（实测可用）、Z 撤回（实测可用）、Esc 关抽屉（托盘内除外，M6）。
- **Screenshots**: 40-45 / 61

## 补交审批真实点击终验结果（任务专节）

10-05 修复（handle_fulfillment_appeal 收敛唯一版本）后首次完整真实点击终验，**结论：修复有效，主链路通过**。

| 环节 | 批准（审计B-20261006-0039） | 驳回（审计B-20261006-0050-REJECT） |
|------|------|------|
| 界面路径 | 铃铛→审批→同意→5s→提交 | 驳回→理由必填报错→填理由→确认→提交 |
| HTTP 响应 | 200 {ok:true, status:"approved"} | 200 {ok:true, status:"rejected"} |
| 后台落库 | ✅ appeal=approved + audit_logs{decision:approved} | ✅ appeal=rejected + **decision_reason 完整落库（p_reason 回归修复界面终验通过）** + audit_logs{decision:rejected} |
| 员工通知 | ✅ 通知行已写（含 resumeAppeal 入口文案） | ✅ 通知行已写，正文含驳回原因 |
| 同源待办关闭 | ✅ 9 条 fulfillment_appeal 待办 → done | ✅ 9 条 → done |
| 三态上报 | audit/employeeNotification/todo = succeeded/succeeded/succeeded | 同左全部 succeeded |
| 界面部分失败呈现 | 未复现故障注入；代码层：workbench 直接 toast err.error 不刷新列表；command-hub 的 toast 标题"审批未能保存，已恢复待处理"与描述"申请已处理，但结果通知发送失败"自相矛盾（代码审查发现，未实测） | 同左 |
| 后续闭环 | /dashboard?resumeAppeal= 实测自动续交并真实生成日报 ✅ | 组员侧看不到驳回结果（H1） |

## Scenario Results（场景组合）

- **First Contact**: 以 persona 视角：落地页 0 点击可读全队状态 ✅；"处理补交申诉"唯一可发现入口是铃铛抽屉（工作台页毫无提示，还谎报 0 条——C1）； Terminology: "履约/断更/标定/豁免"对首次使用者需要学习，但一致。
- **Interrupted Workflow**: 批准的 5s 撤回窗本身就是中断点——关标签页会 flush（H2 证明该路径不可靠）；矩阵重载中断无恢复问题（幂等 fetch）。
- **Wrong Turn Recovery**: 统计卡筛选一键清除（"清除指标筛选 ×"）✅；排序误点即点即生效可再点回 ✅；抽屉 Esc 可关 ✅（托盘内除外 M6）。
- **Returning User**: 筛选/排序/视图不持久（刷新回默认），无"上次看到"标记；角标是唯一"有什么变了"信号（对部分管理员不含申诉，H3）。
- **Keyboard Only**: 抽屉内 J/K/A/R/Z/1-3/Esc 完整可用且有页脚说明 ✅；驳回托盘 Esc 失效（M6）；工作台 Tab 焦点可达主要控件（前 10 站均为可交互元素）。
- **Heavy Data**: 未灌库（纪律）。现有量：27 成员×31 天=837 格矩阵 + 27 人行动港渲染正常；申诉列表 limit=150 无分页 UI（未覆盖登记）。dev 下日历重载 2.5~57s 记 dev-mode 观察。
- **Destructive Confidence**: 单条改判有 5s 撤销 toast ✅（实测生效并恢复）；批量弹窗文案具体但无警示样式与可逆性说明（M5）；驳回需理由且明示"将发送给成员" ✅（但该承诺当前不可兑现，H1）；"一键全部同意(3)"无二次确认仅靠 5s 撤回，且不显示将影响哪些人（未点，文案级观察）。
- **Second User**: 组员视角：铃铛仅"团队待办"页签、无越权内容 ✅；但审批结果完全不可见（H1）；/admin/fulfillment 对 member 服务端重定向 /dashboard（代码核实）。

## Network + Console Errors（全程监控）

| 端点 | 状态 | 页面 | 次数 | 定性 |
|------|------|------|------|------|
| GET /api/admin/fulfillment/appeals?limit=150 | 405 | /admin/fulfillment | 4 会话 6 次 | **Critical C1** |
| POST /api/admin/fulfillment/appeal/handle 等 20+ 业务请求 | 2xx | 全部 | — | 除上述外零 4xx/5xx |
| GET /login（首次） | 500 | login | 1 | dev 首编译观察，未复现 |
| login 页 hydration mismatch warning | console | login | 1 | dev/自动化环境观察 |
| "Execution context destroyed"随机整页导航 | — | /dashboard | 3 | dev 并发会话（HMR）现象，非产品 bug；但它暴露了 H2 的撤回窗风险 |

## Responsive

| 路由 | 1440 | 768 | 375 | 暗色 |
|------|------|-----|-----|------|
| /admin/fulfillment | ✅ | ✅ 无溢出 | ⚠ 横向溢出 76px（矩阵） | 跳过（按任务约定，未覆盖） |
| 行动中枢抽屉 | ✅ | ✅ | ⚠ 入口不存在（M3） | 跳过 |

## What Works Well（供修复保持）

- 三层结果契约真实生效：两单审批的 audit/通知/待办三层全部 succeeded 并逐行 DB 验证——10-05 的函数收敛修复是扎实的。
- 撤回条（5s 倒计时+Z 键）＋单条改判撤销 toast＋"打回待处理"机制，反悔设计意识完整（只差 H2 的回执可靠性）。
- 键盘体系（J/K/A/R/Z/1-3/Esc）＋页脚常驻说明；理由必填行内报错＋1000 字上限双语文案。
- 批准后 resumeAppeal 自动续交真实闭环（实测生成日报）。
- 统计卡即筛选器＋"清除指标筛选 ×"联动；空态文案安心明确。
- 768px 完整可用；移动端有独立底部导航布局（只差行动中枢入口）。

## Priority Recommendations

1. **恢复 appeals GET 处理器 + 工作台申诉加载失败可见化**（C1）——一个 commit 级修复，解锁整个工作台审批面。工作量 S。
2. **让组员看到审批结果**（H1）——结果通知改 todo 分类或加"我的申请"状态卡；同时修掉驳回托盘"将直接发送给成员"的失实承诺。工作量 S/M。
3. **撤回窗改为"确认即提交+服务端打回"**（H2）——reopen 机制已存在，直接复用；至少给 flush 失败留本地重试与提示。工作量 M。
4. **对齐申诉"审批权/提醒权/角标"三处口径**（H3）——决策点：申诉是否需要 manage_members。工作量 S。
5. 其余 M1-M6 按列表顺手收口；M4 历史页签需先在非 dev 环境复核。

## 附：本次会话产生的数据与清理

- appeal#1（0039）approved → resume 自动续交生成 1 条 2026-09-15 测试日报（e9fb45bc，payload 带审计标记）
- appeal#2（0050-REJECT）rejected（decision_reason 含审计标记）
- 18 条申诉待办通知 → done；2 条结果通知 → unread（feed，当前不可达）
- 测试组员 2026-10-06 请假标记已 remove（DB 归零）✅
- 审计A、阿禅的预存申请与数据全程未动
