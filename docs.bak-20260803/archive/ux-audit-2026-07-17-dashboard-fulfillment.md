# DYData 全链路体验审计报告（数据台与发布管理）

**审计日期**：2026-07-17  
**审计人员**：Antigravity (前端视觉/UI 代理)  
**审计对象**：数据台 (`/dashboard`)、发布管理 (`/admin/fulfillment`)  
**审计标准**：顶级 UX 体验标准（布局、多端适配、交互反馈、控制台/网络错误）

---

## 1. 核心结论与严重级别划分

本轮审计采用 Playwright 自动化与手动结合的方式，覆盖了 **1440px 桌面、1024px/768px 平板及 375px 移动端**。我们发现系统整体 UI 视觉风格统一，高质感，但在生产环境配置与 HTML 规范上存在两处致命阻碍点：

| 序号 | 漏洞/痛点描述 | 影响页面 | 严重级别 | 类别 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **生产库履约申诉表缺失（schema 漂移）** | `发布管理` | **Blocker (阻碍)** | 数据库配置 | **已修复** |
| 2 | **HTML 嵌套错误（React 水合失败）** | `发布管理` -> `月度矩阵` | **High (高)** | HTML 规范/交互 | **已修复** ✓ |
| 3 | **本地开发编译死循环** | 本地 E2E 测试 | **Medium (中)** | 开发环境构建 | **已修复** ✓ |
| 4 | **移动端首屏高度占比过大** | `发布管理` (375px 视口) | **Low (低)** | 响应式布局 | 建议优化 |

---

## 2. 缺陷细节与整改台账

### 01. 生产库履约申诉表缺失（Blocker）
*   **现象**：
    在访问发布管理工作台时，控制台报错：
    `[HTTP 500] Internal Server Error - http://localhost:3000/api/admin/fulfillment/appeals?limit=150`。
*   **根因分析**：
    我们在代码中进行了直连数据库测试，发现 `profiles` 和 `fulfillment_records` 正常运作，但查询 `fulfillment_appeals` 时报：
    `Could not find the table 'public.fulfillment_appeals' in the schema cache`。
    这表明 remote 新加坡生产数据库（`gcrhhxaopomtposmahsw.supabase.co`）虽然迁移历史记录了 `20260628001455_fulfillment_backend_loop_fix.sql`，但真实表结构缺失其中的履约申诉与系统设置对象。后续 CX 复核确认 `055_violation_system.sql` 对应的真实表是 `violation_cases` / `violation_test_records`，远端已存在；`public.violations` 不是当前代码使用的表。
*   **业务影响**：
    申诉展示失效，管理员无法正常审批及查阅申诉。
*   **解决方案 (已修复)**：
    CX 已新增并应用补丁迁移 [20260717235530_restore_fulfillment_backend_loop.sql](file:///Users/mac/Projects/dydata/supabase/migrations/20260717235530_restore_fulfillment_backend_loop.sql)，补齐 `fulfillment_appeals`、`system_settings`、相关 RLS 策略、触发器与 `handle_fulfillment_appeal` RPC。验证结果：`fulfillment_appeals` / `system_settings` REST 查询返回 200，登录态访问 `/api/admin/fulfillment/appeals?limit=150` 返回 200。

### 02. HTML 嵌套错误导致 React 水合/水合失效（High）
*   **现象**：
    控制台抛出 React 报错：
    `In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error.`
*   **根因分析**：
    在 `src/app/(app)/admin/fulfillment/components/monthly-matrix.tsx` 中，可折叠的头部容器是一个 `<button type="button" onClick={...}>`，但在折叠状态展开时，头部内部又渲染了月份切换按钮 `<Button variant="ghost" ...>`。
    根据 HTML 5 规范，`<button>` 标签中严禁嵌套另一个 `<button>`。此写法不仅会导致浏览器解析 DOM 树混乱，导致点击月份切换时由于事件冒泡和 HTML 重构，同时触发折叠折拢，影响交互逻辑，还会彻底破坏 React 的客户端 Hydration 流程。
*   **解决方案 (已修复)**：
    将外层折叠头部容器重构为 `<div>`。通过增加 `role="button"`、`tabIndex={0}` 以及 `onKeyDown` 键盘监听（处理 `Enter`/`Space` 触发，同时屏蔽子元素 `<button>` 触发），不仅完全保留了键盘无障碍访问能力，还彻底解决了 Hydration 报错和点击月份导致面板自动合拢的交互 bug。

### 03. 截图写入触发 Next.js 热更新死循环（Medium）
*   **现象**：
    运行 E2E Playwright 脚本时，Next.js dev 经常不断地触发 `[Fast Refresh] rebuilding` 并刷新浏览器，导致正在进行的登录等表单输入被重置，进而测试超时挂起。
*   **根因分析**：
    测试脚本默认把截图保存在 `output/playwright/` 目录下。由于该目录包含在项目根文件夹中，Next.js 编译文件监视器（File Watcher）在检测到新图片写入时，会判定为代码变更并触发热编译（HMR），导致页面重构和连接丢失。
*   **解决方案 (已修复)**：
    将 E2E 脚本的图片输出目录 `OUTPUT_DIR` 移动到项目根文件夹外部（重定向至 `~/.gemini/antigravity/brain/...` 临时存储），完全杜绝了文件写入触发 HMR 热重载的现象，提升了自动化测试效率和稳定性。

---

## 3. 多端响应式适配及视觉审计

### 数据台 (`/dashboard`)
*   **1440px 桌面端**：视觉设计十分精致。骨架屏、日历和提交卡片均显示正常。
*   **1024px / 768px 平板端**：导航自动收缩为侧边/顶栏模式。提交面板布局能够自适应缩放，无文字截断或元素错位。
*   **375px 移动端**：
    *   顶部导航完美折叠至汉堡菜单内。
    *   `数据查看`、`历史记录`、`避坑案例` 与 `申请豁免` 四个 Tab 自动以两行自适应排版。
    *   截图拖拽上传区域在触屏视口下表现符合直觉。

### 发布管理 (`/admin/fulfillment`)
*   **1440px 桌面端**：统计数据栏（StatsBar）和“待处理异常”列表设计典雅，列表操作栏布局合理。
*   **375px 移动端**：
    *   由于“待处理异常”（59人未处理）、“连续未发”与“履约大盘”三张卡片在小屏幕上采用垂直平铺，导致首屏被这三张大卡片填满。
    *   表格部分被完全挤到首屏线下方，用户必须向下划动较长距离才能看到待处理列表。
    *   *建议*：在移动端，将三个统计块重构为横向滑动轮播（Carousel）或可收缩的汇总块，提高核心工作列表（ExceptionQueue）的首屏可见度。
