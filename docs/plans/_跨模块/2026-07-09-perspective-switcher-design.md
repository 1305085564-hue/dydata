# 导航栏视角切换重构设计案

## 1. 变更背景与目的
当前系统在顶栏包含一个“员工 / 管理”的双选项滑动切换组件（Perspective Switcher）。该组件占用顶栏宽度较大，导致在中小屏幕上布局容易拥挤。为了提高顶栏的空间利用率并提升操作的爽快感，我们决定将其重构为单按钮循环切换。

## 2. 详细设计方案

### 变更文件
* `src/components/nav-bar-client.tsx` (前端导航栏客户端组件)

### 修改点 1: 引入图标
从 `lucide-react` 引入 `ArrowLeftRight` 图标作为切换视角的可视化暗示。

### 修改点 2: 视角切换逻辑与 UI 重构
把原本包裹着“员工”和“管理”两个 `button` 以及一个 `motion.div` 的外层容器，替换为单一的扁平圆角按钮。
* **判定状态**：使用当前组件中已存在的常量 `isAdminPath`（通过 `isManagementPath(pathname)` 判断）。
* **跳转目的地**：
  * 若 `isAdminPath` 为 `true`（当前在管理端），按钮显示为 **“组员视角 ⇄”**，点击路由至 `/dashboard`。
  * 若 `isAdminPath` 为 `false`（当前在普通端），按钮显示为 **“管理视角 ⇄”**，点击路由至 `/admin/content`。
* **样式设计**：
  * 采用 `bg-stone-100 dark:bg-stone-900` 结合 `border border-stone-300/20`。
  * 鼠标悬浮时提供微妙的渐变和缩放，以及图标微小的位移动效。
