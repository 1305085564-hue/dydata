# Mac / Windows 跨平台兼容性审计

审计日期：2026-10-30；执行：[CX]。范围：当前 Next.js 工作树的静态审计、可用 Mac 浏览器抽查、修复建议；不修改页面、业务逻辑、接口或数据库。

## 1. 结论与证据边界

- 未发现可据本轮证据定为 P0 的问题。后续已按阿禅授权本地修复发布时间的设备时区偏移及中文输入法回车保护（见§8）；主按钮配色为已确认设计取舍，不列待修复项。
- 字体已有处理：当前采用系统字体、UI 字重 400、中文衬线不小于 20px。按用户要求有限回归，不重跑完整 400/500/600/700 实验。
- **Windows Edge 实机验收：BLOCKED。** 当前工具连接的是 macOS 15.4.1；应用/浏览器清单没有提供可控的 Windows 会话，未发现本地虚拟机应用。ToDesk 等远程工具的安装不证明有可用 Windows 主机。本轮没有把 Mac 调整窗口、DPR 或媒体偏好当作 Windows 验收。
- Mac Chrome 完成工作台、视频复盘、每日大盘的代表状态抽查；Mac Edge 只验证登录页可加载，业务页因无登录态未验。Safari 虽存在于应用清单，本轮未验。
- 源码基线：`c0010937` + 开工时已有 14 个未提交文件。包括工作台、截图槽位和视频提交视图；这些页面结果只代表当前工作树，不代表线上或干净主干。本轮未改这些文件。
- 证据等级：**实测**＝本轮浏览器/函数运行结果；**代码确认**＝静态调用链可确认；**待验证**＝可能影响，尚不能称故障；**历史记录**＝项目文档既有结论，本轮未复做。

## 2. 字体既有经验与有限回归

| 核查内容 | 当前证据与结论 |
|---|---|
| 字体文件与加载 | `src/app/globals.css:14-16` 使用系统 sans/serif/mono；`src/app/layout.tsx:58` 使用等宽数字。`src` 未搜到 `next/font` / `@font-face`，`public` 未找到 woff/ttf/otf。应用未配置下载字体。开发页面观察到的 `/__nextjs_font/geist-latin.woff2` 来自 Next 开发工具，不是业务字体。 |
| 400/500/600/700 | `docs/系统架构与设计/视觉与数值手册.md:42,108-119` 已规定 UI 400，记录 Windows 字体的缺档回退；本轮视频复盘、工作台已渲染主内容的 computed font-weight 集合均为 `400`。源码扫描只发现 OG 分享图片的显式 600，属于单独渲染器，不是 UI 残留。computed 400 不等于证明 Windows 实际字形。 |
| 中文衬线 | `docs/通用管理/纠错索引.md:177-180` 留有 2026-10-26 Windows 目检：18px 横笔偏虚，20/28px 可分层。当前栈含 Songti SC / SimSun；本轮视频复盘主标题为 serif 28px、行高 33.6px。复用历史结论，未重新声称 Windows 通过。 |
| 小字、行高、混排 | body 为 14px / 1.6 / 0.005em（`globals.css:158-162`）；表头实测 12px / 19.2px / `#78716C`。表头色与画布计算对比度约 4.67:1，不能仅凭 12px 判为故障；125%/150% 实屏、雅黑与 Segoe 混排基线仍待目检。 |
| 清晰度的归因 | `-webkit-font-smoothing` / `-moz-osx-font-smoothing` 不是 Windows 清晰度开关。截图、显示器像素密度、系统缩放、浏览器缩放、字体缺档分别记录；不建议用全局放大或切两套页面解决。 |
| 既有保护 | `node_modules/.bin/tsx --test src/styles/css-tokens.test.ts`：退出 0，5/5 通过。保护字体栈、CSS token 与弹层遮罩，不能代替 Windows 字形目检。 |

字重匹配规则参考 [MDN font-weight](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-weight)。该规则解释缺档匹配，不证明某台机器安装了哪些字重。

## 3. 风险清单与修复顺序

### P0

本轮没有足够证据支持 P0；这不等于全站、所有系统均无严重问题。

### P1-01：设备时区可能改变作品发布时间（已本地修复，完整上传待验）

- 位置：`src/app/api/ocr-screenshot/ocr-contract.ts:117-126` 将 OCR 时间规范为带时区的 ISO；`src/app/(app)/dashboard/video-submit-form-v2/upload-controller.ts:157-179` 调用转换并写入表单；`src/lib/video-submit/domain/form-rules.ts:47-51` 使用设备本地年月日时分；提交字段见 `src/app/(app)/dashboard/video-submit-form-v2.tsx:893`；服务端 `src/app/api/video-submit/stability.ts:46-51` → `src/lib/日报.ts:48-61` 又把无时区字符串按 +08:00 保存。
- 修复前技术原因：第一次转换受设备时区影响，第二次解释固定为上海时间，时间含义在两端发生变化；当前修复见§8。
- 实测：同一输入 `2026-10-28T00:30:00+08:00`，用现有函数串联执行：

| 进程 TZ | 表单值 | 归一化存储值 |
|---|---|---|
| Asia/Shanghai | 2026-10-28T00:30 | 2026-10-27T16:30:00.000Z（正确） |
| America/Los_Angeles | 2026-10-27T09:30 | 2026-10-27T01:30:00.000Z（比正确结果早 15 小时） |

- 用户影响：设备设为非上海时区时，可能错到前一天，影响发布时间显示、日期归属和补交判断。Mac 与 Windows 均可触发，**不是 Windows 专属错误**。本轮未上传、未保存真实业务数据，未证明线上已有受影响记录。
- 推荐：复用现有上海时间格式化能力，让 OCR → 表单 → 保存始终表达同一时间；补上海、UTC、洛杉矶及跨日样本。修复后在隔离数据环境完成真实上传/识别/保存/回读核对。

### 原 P1-02：主按钮配色——已确认设计取舍，不修复

- 2026-10-30 阿禅明确确认：白字配现有橙底的体感是项目选定效果，保留约 **3.12:1** 的现有配方，不改颜色、字号、字重或组件。
- **纠正初次定级**：4.5:1 来自外部 WCAG 普通文字无障碍标准，不是本项目设计哲学或规范要求，也不代表已复现 Windows 阅读故障。此前仅凭该标准列 P1 过重；撤销 P1 定级，退出待修复清单。
- 外部标准与项目取舍分开记录：现有配色未达到该项 WCAG AA 数值要求，但不据此自动要求重设计。后续若真实用户反馈或实机验证发现阅读困难，再重新评估。
- 代码保持 `src/components/ui/button.tsx` 与登录按钮调用原样；本轮不修改全局设计规范。
- 标准背景：[W3C 普通文字对比度要求](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)。

### P1-03：中文输入法回车可能误触跳栏或保存（已本地修复，系统 IME 待验）

- 位置：`src/app/(app)/dashboard/form-v2/right-column.tsx:118-122` 标题 Enter 直接跳文案；`src/app/(app)/admin/ai-config/components/model-family-card.tsx:220-222` Enter 直接保存重命名。
- 修复前技术原因：两个处理器未判断组合输入状态，当时仓库检索未发现 `isComposing` / `keyCode 229` 保护。输入法确认候选字也可能发出 Enter；当前保护及验证见§8。
- 实测边界：Mac Chrome 对已完成输入的标题按 Enter，焦点确实转到 `content`；没有做真实输入法选词实验，不能把普通 Enter 测试当作误触复现。
- Windows 影响：微软拼音选词时，可能提前跳栏、保存半成品名称。Mac 中文输入法也须回归。
- 推荐：先在微软拼音复现；确认后在 Enter 行为前增加组合输入保护，并避免嵌套标题键盘处理冒泡。优先级来自对操作成功率的潜在影响，不表示已坐实故障。

### P2-01：横向数据区的滚动入口偏弱（代码确认，Windows 鼠标待验）

- 位置：`src/app/globals.css:188-203,227-233` 表格细滚动条与隐藏滚动条；`src/components/ui/select.tsx:92` 下拉滚动条；`src/app/(app)/dashboard/components/monthly-fulfillment-strip.tsx:209-214` 隐藏滚动条且 `focus:outline-none`；`src/components/leaderboard/leaderboard.tsx:304` 横向排序区隐藏滚动条。
- 原因：浅色窄条、隐藏入口和缺少聚焦标记，可能使普通鼠标用户不知道还有横向内容。`#E2E2DF` 对白底约 1.30:1；此读数用于说明浅弱程度，不直接将所有装饰线判为标准违规。
- 实测：1024×640 的复盘表格约 1226px、容器 964px，容器 overflow-x 为 auto，整页没有横向溢出；工作台微格内容 888px、容器 670px、可聚焦。**未复现“数据无法访问”**，也未完成真实鼠标/触控板横向拖动。
- 推荐：先用 Windows 普通鼠标拖动及 Tab/方向键验证；若发现不可达或入口难辨，只为溢出的容器保留可见滚动提示和焦点标记，不给全站加大滚动条。
- 工作台该文件为开工时已有未提交改动，不能把此发现归入已上线版本。

### P2-02：减弱动态效果覆盖不完整（Mac 浏览器诊断已复现）

- 位置：`src/styles/animations.css:80-92` 只关闭部分自定义动画；`src/components/ui/popover.tsx:48-49` 日期弹层有 animate-in/zoom/fade；`dialog.tsx:34,58`、`select.tsx:92` 有类似配置。
- 实测：在 Mac Chrome 用浏览器媒体偏好诊断将 `prefers-reduced-motion` 设为 reduce；确认 matchMedia 为 true 后打开每日大盘日期弹层，computed animation-name 仍为 `enter`、duration 为 `0.1s`。只实测了 Popover，其他弹层是同类候选。随后已清除媒体覆盖。
- Windows 影响：开启减少动态效果的用户仍可能看到缩放淡入。此结果是浏览器诊断，不能冒充 Windows 系统设置实测。
- 推荐：在共享弹层动画层统一补减少动态效果分支，保留功能反馈；按日期弹层、下拉、普通弹窗逐个回归。无需删除所有动画。

### P2-03：旧浏览器与 Edge 的持续验收缺口（配置确认）

- 位置：`package.json:53-61` 的 Next/Tailwind 等版本；`playwright.config.ts:38-43`、`playwright.role.config.ts` 仅有 chromium / Desktop Chrome。
- 原因：默认 Chromium 自动化不等于真实 Edge，也不等于 Windows 字体栅格化；当前门禁没有系统缩放、输入法及 Edge 渠道矩阵。
- 影响：Windows 企业设备若锁定旧浏览器，部分现代 CSS 可能失效；未发现本轮被测 Chrome 版本出现此故障。用户实际最低 Edge 版本尚不明确。
- 推荐：先记录实际用户的 Edge 版本，明确支持范围；增加 Windows Edge 稳定版的持续冒烟。Tailwind 官方给出的现代浏览器基线为 Chrome 111、Safari 16.4、Firefox 128；这不能单独证明本项目所有组件在对应版本都通过。[官方兼容说明](https://tailwindcss.com/docs/compatibility)

### P2-04：Windows 原生开发命令不完整（代码确认，Windows 命令未运行）

- 位置：`package.json:17-18` 使用 POSIX 的 `set -a`、`[ -f ]`、`. env`；`:31` 使用内联环境赋值；`scripts/list-users.mjs:9` 固定 Mac 绝对路径；`package.json:5-6` 仅声明 Node 下限，未见项目 Node 锁版本文件。
- 原因/影响：Windows 默认 npm 的 cmd shell 不能按 POSIX 语法运行这些门禁；换成 Git Bash/WSL 后行为又不同。Mac 绝对路径影响直接运行该手动工具的开发者，不影响网站用户浏览。
- 推荐：将加载环境文件移入现有 Node 入口，按仓库根目录寻址；固定团队 Node 基线。先验证 Windows 原生安装和门禁，再决定是否需要 WSL。禁止为此改浏览器业务逻辑。

## 4. 其他类别的审计状态

| 类别 | 本轮结论 | 剩余验证 |
|---|---|---|
| 表格、卡片、按钮、弹窗、下拉 | 共享组件有 overflow/max-height、标准按钮与 Base UI 弹层；Mac 抽查未发现整页横向溢出。复盘详情在 1024×640 稳定后 x=169、y=60、w=840、h=580，右上关闭按钮在视口内；初始过渡尺寸不作为稳定故障。 | Windows 100/125/150% 缩放、200% 浏览器缩放、Tab 焦点及滚动到底。 |
| 图标、阴影、边框 | 以 SVG 图标、CSS 阴影/边框为主，未发现必须为 Windows 单独换图标的证据。现有边框较浅。 | Windows 对比度主题下选中态/焦点是否可见；不同硬件上的细线清晰度。 |
| 长列表和图表 | 当前复盘有 50/100/500 分页入口；本轮样本仅 15 条，不能代表 500 条性能。每日大盘趋势 SVG 在较窄窗口仍显示，表格无整页溢出；源码 `pulse-sparkline.tsx:43-57` 使用 viewBox、非缩放描边。其他 Recharts 图未逐张实测。 | 500 条列表滚动、图表提示、缩放、高密度屏与低配 Windows 的响应耗时。 |
| 复制粘贴、上传下载 | 详情复制 `content-detail-dialog.tsx:121-127` 有 await/catch 错误提示；上传使用 File/FormData 等标准能力，静态未确认 Windows API 专属不兼容。本轮不上传或提交真实业务数据，也未读用户剪贴板。 | Windows 截图粘贴/多图、中文及空格文件名、文件选择取消、断网重试；下载后用 Excel 打开检查内容。 |
| 导出旧候选 | `src/app/(app)/admin/export-button.tsx:47-53` 下载后立即 revoke URL 有时序疑点，但全仓只找到定义、未找到调用方。 | 不把未接入组件写成线上下载故障；先确认真实导出入口再验。 |
| 日期和数字 | 发现 P1-01；复盘/大盘实测有中文日期、百分数、万位及千位分隔显示，未发现本轮样本数字截断。其他 toLocale 调用未逐场景跑时区矩阵。 | 上海/UTC/洛杉矶、跨月/跨年/夏令时、英文系统区域及小数输入。 |
| 鼠标、触控板、快捷键、IME | 实测了点击、普通 Enter、Space 打开下拉、详情 Esc；静态发现 IME 保护缺口。 | 真鼠标滚轮/Shift+滚轮/拖条、触控板横向手势、Ctrl/Cmd 粘贴与系统输入法选词。 |
| 性能 | Mac 本地 next dev 单次大盘导航：TTFB 约 3040ms、DOMContentLoaded 约 13625ms；页面资源记录中 action-center/summary 约 4343ms。说明该开发样本较慢，不能解释为 Windows 故障，也不能替代生产 p95。 | 同构建、同角色、同网络下的 Windows Edge / Mac 对照；冷/热打开与列表500条。 |

## 5. 本轮真实浏览器证据

环境：macOS 15.4.1；已安装 Chrome 156.0.8078.48、Edge 154.0.4258.53。Chrome UA 报 Chrome/156；Edge 版本来自本机应用元信息。测的是 `http://localhost:3000` 开发服务，连接已有数据，**不做业务写验收**。标题临时输入的审计文字已清空。

| 页面 / 场景 | 已执行与结果 | 边界 |
|---|---|---|
| `/dashboard` | 1024×640 与 1366×768 视口档；工作台卡片/微格/表单；标题填中英数字并按 Enter，焦点切到文案，再清空。1024 档 body/root 均1009px。 | 未提交、未上传；IME 不在此证据内。 |
| `/admin/content` | 1366×768 与 1024×640；列表数据、跨月10月→9月、打开作品详情、Esc 关闭、Space 打开时间范围下拉。1366 档 body/root 均1351px；1024 档均1009px，表格由容器横向承载。 | 数据样本15条；未做所有筛选组合、500条、截图灯箱和编辑/删除。 |
| `/admin/pulse` | 空日期状态→前一天有数据状态；趋势图、人员表与作品表；两个视口截图比较；抽查控制台 error/warn 返回空数组。 | 非全站控制台结论；未验所有图表提示、所有成员详情。 |
| Mac Edge | 访问相同本地复盘地址跳登录页；登录页文字、输入框、按钮可见，已截图。 | 无当前登录态，未尝试账号登录；不能算 Edge 业务验收，更不能算 Windows 验收。 |

截图保存在本机 `output/跨平台审计-2026-10-30/`（被仓库忽略，不作为线上或 Windows 证据）。文件名中的1366/1024代表请求的视口档；实际 clientWidth 会受15px滚动条影响，截图编码尺寸也可能受浏览器捕获缩放影响，不能反推物理显示器分辨率。

- `Mac-Chrome-视频复盘-1366.jpg` / `Mac-Chrome-视频复盘-1024.jpg`
- `Mac-Chrome-工作台-1024.jpg` / `Mac-Chrome-工作台-1366.jpg`
- `Mac-Chrome-作品详情-1024.jpg`
- `Mac-Chrome-每日大盘-1366.jpg` / `Mac-Chrome-每日大盘-1024.jpg`
- `Mac-Edge-登录页.jpg`

## 6. 可持续跨平台验收清单

每次涉及共享字体、组件、布局、上传或发布，按变更范围执行；无需每次全站全组合。保存版本、系统、浏览器、角色、缩放、时区、耗时和截图。同一版本 Mac/Windows 配对，先对数据和操作结果，再对层级与可读性，不要求像素相同。

| 层 | 最小矩阵与通过标准 |
|---|---|
| 环境登记 | Windows 11 + Edge 稳定版为主，Windows 10 若仍在实际用户群则补；Mac Chrome 为对照，Mac Edge 补浏览器差异。记录系统构建、浏览器完整版本、CPU/内存、显示器分辨率、系统缩放、浏览器缩放、区域、时区、ClearType 与对比度主题。 |
| 缩放/尺寸 | Windows 实机显示缩放100/125/150%，浏览器100%先测；另测浏览器125/200%。窗口至少1366×768、1920×1080，附1024×640可用内容区。记录实际 CSS clientWidth/clientHeight/DPR，不把修改 DPR 当实机通过。 |
| 字体有限回归 | 选页面标题20/28、正文14、表头/辅助12及中英数字长名字；确认层级分得开、文字未裁切、标点基线正常。400/500/600/700样张仅在字体栈或字重策略变化时重做，不把 computedStyle 当实际字体证明。 |
| 核心页面 | 工作台输入/伙伴选择/日期/截图；复盘筛选/排序/50与500分页/详情/截图；大盘日期/人员/趋势；选题库搜索/详情。主操作始终可达，无整页意外溢出、关闭后无隐形遮罩。 |
| 输入与键盘 | 微软拼音拼 `zhongwen`，Enter确认候选后仍留当前输入框且未保存；再一次Enter才执行明确动作。Tab/Shift+Tab顺序正确；Esc关闭且焦点恢复；空格/方向键操作下拉；分别验Ctrl与Cmd组合。 |
| 指针/滚动 | 普通鼠标拖水平条、Shift+滚轮、竖滚轮，Mac触控板横/竖手势；冻结列、吸顶表头与底部操作不盖数据。 |
| 文件/剪贴板 | 在隔离数据环境用中文、空格、长文件名及PNG/JPEG；验证取消/多选/过大/断网提示；Windows截图工具与Ctrl+V、Mac截图与Cmd+V；下载文件真实存在且Excel打开无损，权限拒绝明确提示失败。 |
| 时间与数字 | 上海、UTC、洛杉矶下同一带时区样本保存回读一致；跨日/月/年与夏令时不偏；英文系统区域下日期语义和小数输入正确。 |
| 系统偏好 | 减弱动态效果、Windows对比度主题、键盘焦点；选中/错误状态同时有文字/图标信号，不能只剩颜色或阴影。 |
| 性能 | 使用同一生产构建、同网络和数据，冷/热分别至少10次先看样本分布；正式p95需足量样本。预算沿用《工程运行事实》：工作台首屏2s/完整3s/单接口600ms；复盘2.5s/5s/1200ms；其他登录页2.5s/4s/800ms。超预算分别排查网络、服务端、脚本、绘制；不要因Windows较慢就先重写组件。 |

需要解除的环境阻塞：一台可控 Windows 主机（含已授权测试账号、微软拼音、普通鼠标、可调显示缩放）或同等真实远程 Windows 会话；上传/保存需要隔离数据环境。拿到后先复验 P1-03 与字体/滚动，再补文件操作和性能，不重做本轮已确认的代码链。

## 7. 命令、覆盖与交付状态

- `sw_vers`、应用清单/浏览器清单、应用 Info.plist：已读取，环境如上。
- `node_modules/.bin/tsx --test src/styles/css-tokens.test.ts`：退出0，5通过/0失败；仅字体与CSS既有保护。
- `TZ=Asia/Shanghai node_modules/.bin/tsx -e 'import {toDateTimeLocalValue} from "./src/lib/video-submit/domain/form-rules"; import {normalizePublishedAtForStorage} from "./src/lib/日报"; const source="2026-10-28T00:30:00+08:00"; const form=toDateTimeLocalValue(source); console.log(JSON.stringify({zone:process.env.TZ,source,form,stored:normalizePublishedAtForStorage(form)}))'`：退出0；把TZ换为`America/Los_Angeles`再跑，退出0，输出见P1-01。未连接数据库。
- Node 相对亮度计算：退出0，白/主橙3.12、表头墨/画布4.67、边框/白1.30；只代表这些明确色对。
- 浏览器通过 CUA 执行真实页面操作、读取尺寸/样式/安全的导航耗时；未读取登录令牌，未保存请求正文或凭据。媒体/视口临时覆盖已清除。
- 首轮审计仅产出报告与日志；后续修复见§8。均为本地提交，**尚未 push**，不代表已上线。
- 首轮未运行发布门禁、构建或发布；后续只运行修复相关检查。完整 Windows、角色和性能验收仍按上述待验项保留。


## 8. 两项修复与配色确认（2026-10-30 后续）

### 冻结范围

阿禅授权：更新报告并保留主按钮现有配色；修复 P1-01 与 P1-03。只改时间回填、标题/模型名/同组件渠道名的回车行为及验收资料；不改接口、数据库、视觉、其他 P2 项，不 push。开工14项他人未提交修改继续保留，不夹带提交。

### 修改与验证

| 项目 | 实现与实测结果 | 尚未覆盖 |
|---|---|---|
| P1-01 | `src/lib/video-submit/domain/form-rules.ts` 复用现有上海时间回填函数，移除依赖设备时区的年月日时分拼接。新增同目录 `form-rules.test.ts`：上海/UTC/洛杉矶 × 午夜、跨年、美国夏令时切换前后，检查表单值和存储归一化一致；无效输入继续返回null。修复前测试退出1（UTC回填前一天16:30），修复后退出0。浏览器隔离页在洛杉矶时区显示 `2026-10-28T00:30`，保存归一化为正确的 `2026-10-27T16:30:00.000Z`。 | 浏览器验证调用真实函数，没有伪装完成OCR上传/保存；真实上传、数据库回读与Windows实机仍待隔离环境。未改服务器存储口径。 |
| P1-03 | 标题、模型和渠道名称在 `nativeEvent.isComposing` 或 `keyCode===229` 时忽略快捷动作；模型名称输入阻止键盘事件冒泡，标题行只响应自身键盘事件。隔离页挂载真实 `ModelFamilyCard`、保存回调仅本地计数。修复前组合输入Enter会保存1次且折叠；修复后组合Enter/229/组合空格均保持编辑、计数0，正常Enter只保存1次且不折叠；渠道名同样通过，Escape取消不保存。真实 `/dashboard` 页的组合Enter/229均保持 `video_title` 焦点，正常Enter转 `content`，随后清空测试标题。 | 组合事件是明确标志的浏览器合成事件，不是操作系统输入法候选窗口；微软拼音和Mac真实输入法选词仍待实机。未修改真实模型或渠道名称。 |
| 原 P1-02 | 按用户明确决定撤销P1，标为项目已确认设计取舍；通用按钮和登录页面零改动。 | 不将外部标准自动提升为本项目设计要求。 |

验收命令与结果：

- `node_modules/.bin/tsx --test src/lib/video-submit/domain/form-rules.test.ts src/lib/日报.test.ts 'src/app/(app)/dashboard/video-submit-form-v2/upload-controller.test.ts'`：退出0，10/10通过；新时间测试先红后绿。
- 定向 ESLint：`form-rules.ts`、`form-rules.test.ts`、`right-column.tsx`、`model-family-card.tsx`、`tests/compatibility/输入法回车.fixture.tsx`；退出0，0报错。
- `node_modules/.bin/tsc --noEmit --pretty false`：退出0；`git diff --check`：退出0。
- 浏览器隔离验收：`tests/compatibility/输入法回车.fixture.tsx`，编译到 `/tmp/dydata-ime/app.js`，配静态HTML并用 `python3 -m http.server 3238 --bind 127.0.0.1 --directory /tmp/dydata-ime` 服务；不依赖登录，不接业务接口。编译命令见文件头。初次误用Node执行esbuild二进制失败，改为直接执行二进制后构建通过。
- 代表截图：`output/跨平台审计-2026-10-30/时区与输入法修复验收.jpg`。隔离页控制台error/warn为空；测试后的时区覆盖已恢复，真实工作台临时标题已清空。未运行发布门禁或生产写验收。

同类扫描：时间回填旧实现仅一个调用方，已原位替换，无废弃函数残留；同一模型组件的渠道重命名同步补保护。全仓还发现其他范围外的Enter快捷键候选（`premium-settings-modal.tsx`名称编辑、`inline-feedback-tray.tsx`以及工作台全局Ctrl/Cmd+Enter）；本次不扩大修改，需按各自交互另验，不能据静态扫描定为已发生故障。数字指标输入的Enter用于数字跳栏，不混同中文名称选词。

交付分层：两项代码修复及上述本地验证已完成；完整上传与系统输入法/Windows实机为未覆盖证据边界；其他P2风险保留。没有发布或历史数据修正，**尚未 push**。
