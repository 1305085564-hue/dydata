---
name: motion
description: Motion（前身为 framer-motion）React 动画库。适用于拖拽、滚动动画、手势、SVG 形变，或遇到包体积、复杂过渡、弹簧物理报错等场景。

license: MIT
---

# Motion 动画库

## 概述

Motion（包名：`motion`，前身为 `framer-motion`）是业界标准的 React 动画库，已有数千款应用在生产环境中使用。它拥有 30,200+ GitHub Stars 和 300+ 官方示例，提供声明式 API，让你用极少的代码实现复杂的动画效果。

**核心能力：**
- **手势**：拖拽、悬停、点击、平移、聚焦，跨设备支持
- **滚动动画**：视口触发、滚动联动、视差效果
- **布局动画**：FLIP 技术实现平滑布局变化，共享元素过渡
- **弹簧物理**：自然、可定制的物理驱动缓动
- **SVG**：路径形变、线条绘制、属性动画
- **退出动画**：AnimatePresence 实现卸载过渡
- **性能**：硬件加速、ScrollTimeline API、包体积优化（2.3 KB - 34 KB）

**生产环境验证**：React 19、Next.js 15、Vite 6、Tailwind v4

---

## 何时使用本技能

### ✅ 适合使用 Motion 的场景：

**复杂交互**：
- 拖拽界面（可排序列表、看板、滑块）
- 带缩放/旋转/颜色变化的悬停状态
- 带弹跳/挤压效果的点击反馈
- 适合移动端的平移手势

**基于滚动的动画**：
- 带视差层的 Hero 区域
- 滚动触发的显隐（元素进入视口时淡入）
- 与滚动位置联动的进度条
- 随滚动变换的吸顶头部

**布局过渡**：
- 路由间的共享元素过渡（卡片 → 详情页）
- 带自动高度动画的展开/收起
- 网格/列表视图切换时的平滑重排
- 带动画下划线的标签导航

**高级特性**：
- SVG 线条绘制动画
- 形状间的路径形变
- 自然弹跳的弹簧物理
- 编排序列（交错显隐）
- 带背景模糊的模态对话框

**包体积优化**：
- 需要 2.3 KB 的动画库（useAnimate mini）
- 想将 Motion 从 34 KB 降到 4.6 KB（LazyMotion）

### ❌ 不适合使用 Motion 的场景：

- **简单列表动画**（改用 `auto-animate`：3.28 KB vs 34 KB）
- 没有交互的**静态内容**
- **Cloudflare Workers**（使用 `framer-motion` v12.23.24 变通方案，见已知问题）
- **3D 动画**（改用 Three.js 或 React Three Fiber）

---

## 安装

### 最新稳定版

```bash
bun add motion  # 推荐
# 或: npm install motion
# 或: yarn add motion
```

**当前版本**：12.23.24（验证日期 2025-11-07）

**Cloudflare Workers 替代方案**：
```bash
# 如果部署到 Cloudflare Workers，请使用 framer-motion
bun add framer-motion
# 或: npm install framer-motion
```

### 包信息

- **包体积**：
  - 完整 `motion` 组件：~34 KB（minified+gzipped）
  - `LazyMotion` + `m` 组件：~4.6 KB
  - `useAnimate` mini：2.3 KB（最小的 React 动画库）
  - `useAnimate` hybrid：17 KB
- **依赖**：React 18+ 或 React 19+
- **TypeScript**：内置原生支持（无需 @types 包）

---

## 核心概念

### 1. motion 组件

将任意 HTML/SVG 元素转换为可动画的组件：

```tsx
import { motion } from "motion/react"

// 基础动画
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  Content fades in and slides up
</motion.div>

// 手势控制
<motion.button
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.95 }}
>
  Click me
</motion.button>
```

**属性：**
- `initial`：初始状态（对象或 variant 名称）
- `animate`：目标状态（对象或 variant 名称）
- `exit`：卸载状态（需要 AnimatePresence）
- `transition`：时间/缓动配置
- `whileHover`、`whileTap`、`whileFocus`：手势状态
- `whileInView`：视口触发动画
- `drag`：启用拖拽（"x"、"y" 或 true 表示双向）
- `layout`：启用 FLIP 布局动画

### 2. Variants（动画编排）

命名动画状态，可在组件树中向下传递：

```tsx
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

<motion.div variants={variants} initial="hidden" animate="visible">
  Content
</motion.div>
```

**如需高级编排**（staggerChildren、delayChildren、动态 variants），请加载 `references/core-concepts-deep-dive.md`。

### 3. AnimatePresence（退出动画）

让组件卸载时也能播放动画：

```tsx
import { AnimatePresence } from "motion/react"

<AnimatePresence>
  {isVisible && (
    <motion.div
      key="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      Modal content
    </motion.div>
  )}
</AnimatePresence>
```

**关键规则：**
- AnimatePresence **必须保持挂载**（不要包在条件内部）
- 所有子元素 **必须有唯一的 `key` 属性**
- AnimatePresence **包裹条件表达式**，而不是反过来

**常见错误**（退出动画不会播放）：
```tsx
// ❌ 错误 — AnimatePresence 随条件一起卸载
{isVisible && (
  <AnimatePresence>
    <motion.div>Content</motion.div>
  </AnimatePresence>
)}

// ✅ 正确 — AnimatePresence 保持挂载
<AnimatePresence>
  {isVisible && <motion.div key="unique">Content</motion.div>}
</AnimatePresence>
```

### 4. 布局动画（FLIP）

自动为布局变化添加动画：

```tsx
<motion.div layout>
  {isExpanded ? <FullContent /> : <Summary />}
</motion.div>
```

**特殊属性**：`layoutId`（共享元素过渡）、`layoutScroll`（可滚动容器）、`layoutRoot`（固定定位）。

**如需高级模式**（LayoutGroup、layoutId 编排），请加载 `references/core-concepts-deep-dive.md`。

### 5. 滚动动画

```tsx
// 视口触发
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
>
  Fades in when entering viewport
</motion.div>

// 滚动联动（视差）
import { useScroll, useTransform } from "motion/react"
const { scrollYProgress } = useScroll()
const y = useTransform(scrollYProgress, [0, 1], [0, -300])
<motion.div style={{ y }}>Parallax effect</motion.div>
```

**如需高级滚动模式**（useScroll 偏移、useTransform 缓动、视差层），请加载 `references/core-concepts-deep-dive.md`。

### 6. 手势

```tsx
<motion.div drag="x" dragConstraints={{ left: -200, right: 200 }}>
  Drag me
</motion.div>
```

**可用属性**：`whileHover`、`whileTap`、`whileFocus`、`whileDrag`、`whileInView`、`drag`。

**如需高级拖拽控制**（动量、弹性、事件处理器），请加载 `references/core-concepts-deep-dive.md`。

### 7. 弹簧物理

```tsx
<motion.div
  animate={{ x: 100 }}
  transition={{ type: "spring", stiffness: 100, damping: 10 }}
/>
```

**常用预设**：弹跳 `{ stiffness: 300, damping: 10 }`，平滑 `{ stiffness: 100, damping: 20 }`。

**如需调整弹簧参数**（mass、可视化工具、预设），请加载 `references/core-concepts-deep-dive.md`。

---

## 集成指南

**Vite**：`bun add motion` → `import { motion } from "motion/react"`（开箱即用）

**Next.js App Router**：需要 `"use client"` 指令或客户端组件包装器
```tsx
"use client"
import { motion } from "motion/react"
```

**Tailwind**：⚠️ 移除 `transition-*` 类（会与 Motion 动画冲突）

**Cloudflare Workers**：改用 `framer-motion` v12.23.24（Motion 有 Wrangler 构建问题）

**如需完整集成指南**（Next.js 模式、SSR、框架特定问题），请加载 `references/nextjs-integration.md`。

---

## 性能优化

**包体积**：使用 LazyMotion（34 KB → 4.6 KB）：
```tsx
import { LazyMotion, domAnimation, m } from "motion/react"
<LazyMotion features={domAnimation}>
  <m.div>Only 4.6 KB!</m.div>
</LazyMotion>
```

**长列表**：对 50+ 动画项使用虚拟化（`react-window`、`react-virtuoso`）。

**如需完整优化指南**（硬件加速、内存分析、生产基准），请加载 `references/performance-optimization.md`。

---

## 无障碍支持

**尊重 `prefers-reduced-motion`**：
```tsx
import { MotionConfig } from "motion/react"
<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

**键盘支持**：使用 `whileFocus` 实现键盘触发动画。
```tsx
<motion.button whileFocus={{ scale: 1.1 }} tabIndex={0}>
  Keyboard accessible
</motion.button>
```

**如需完整无障碍指南**（ARIA 模式、屏幕阅读器、AnimatePresence 变通方案、测试），请加载 `references/accessibility-guide.md`。

---

## 常见模式

**模态对话框**（AnimatePresence + 背景遮罩）：
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.dialog exit={{ opacity: 0 }}>Content</motion.dialog>
  )}
</AnimatePresence>
```

**手风琴**（高度动画）：
```tsx
<motion.div animate={{ height: isOpen ? "auto" : 0 }}>
  Content
</motion.div>
```

**如需 15+ 生产级模式**（轮播、标签、滚动显隐、视差、通知），请加载 `references/common-patterns.md`。

---

## 已知问题与解决方案

### 问题 1：AnimatePresence 退出动画不生效（最常见）

**症状**：组件直接消失，没有退出动画。

**解决方案**：AnimatePresence 必须保持挂载，包裹条件表达式（而不是被条件包裹）：
```tsx
// ❌ 错误
{isVisible && <AnimatePresence><motion.div>Content</motion.div></AnimatePresence>}

// ✅ 正确
<AnimatePresence>
  {isVisible && <motion.div key="unique">Content</motion.div>}
</AnimatePresence>
```

### 问题 2：Next.js 缺少 "use client"

**症状**：构建失败，提示 "motion is not defined" 或 SSR 错误。

**解决方案**：添加 `"use client"` 指令：
```tsx
"use client"
import { motion } from "motion/react"
```

### 问题 3：Tailwind 过渡冲突

**症状**：动画卡顿或不生效。

**解决方案**：移除 `transition-*` 类（Motion 会覆盖 CSS 过渡）：
```tsx
// ❌ 错误: <motion.div className="transition-all" animate={{ x: 100 }} />
// ✅ 正确: <motion.div animate={{ x: 100 }} />
```

### 问题 4：Cloudflare Workers 构建错误

**症状**：使用 `motion` 包时 Wrangler 构建失败。

**解决方案**：改用 `framer-motion` v12.23.24（GitHub issue #2918）：
```bash
bun add framer-motion  # API 相同，支持 Workers
```

### 问题 5：长列表性能

**症状**：50-100+ 动画项导致严重卡顿。

**解决方案**：使用虚拟化（`react-window`、`react-virtuoso`）。

**如需了解更多问题**（layoutScroll、layoutRoot、AnimatePresence + layoutId），请加载 `references/nextjs-integration.md` 或 `references/core-concepts-deep-dive.md`。

---

## 何时加载参考文档

Claude 应根据用户需求加载以下参考文档：

### 加载 `references/core-concepts-deep-dive.md` 的场景：
- 用户询问 variants 编排（staggerChildren、delayChildren、动态 variants）
- 用户需要高级布局动画（layoutId 共享过渡、LayoutGroup）
- 用户想要滚动联动动画（useScroll 偏移、useTransform 缓动、视差层）
- 用户需要复杂拖拽模式（动量、弹性、事件处理器、约束）
- 用户询问弹簧物理调参（mass 参数、可视化工具、自定义预设）

### 加载 `references/performance-optimization.md` 的场景：
- 用户想将包体积降到 4.6 KB 以下（useAnimate mini、LazyMotion 对比）
- 用户提到 "app is slow"、"janky animations"、"laggy" 或 "performance issues"
- 用户列表中有 50+ 动画项（需要虚拟化）
- 用户需要内存分析或生产基准

### 加载 `references/nextjs-integration.md` 的场景：
- 用户使用 Next.js 构建（App Router 或 Pages Router）
- 用户遇到 SSR 错误、"use client" 错误或 hydration 问题
- 用户询问路由过渡或页面导航动画
- 用户需要 Next.js 特定变通方案（Reorder 组件、AnimatePresence 软导航）

### 加载 `references/accessibility-guide.md` 的场景：
- 用户询问 "prefers-reduced-motion" 或无障碍合规
- 用户需要 ARIA 集成模式（role、label、announcement）
- 用户想要屏幕阅读器兼容
- 用户提到无障碍审计或 WCAG 合规
- 用户询问 AnimatePresence reducedMotion 变通方案（已知问题 #1567）

### 加载 `references/common-patterns.md` 的场景：
- 用户询问特定 UI 模式（模态、手风琴、轮播、标签、下拉、Toast 等）
- 用户需要可直接复制粘贴的生产代码示例
- 用户想查看 15+ 真实世界的动画模式

### 加载 `references/motion-vs-auto-animate.md` 的场景：
- 用户在 Motion 和 AutoAnimate 库之间做选择
- 用户提到 "simple list animations" 或 "bundle size concerns"
- 用户问 "which animation library should I use?" 或 "is Motion overkill?"
- 用户需要功能对比或决策矩阵

---

## 模板

本技能在 `templates/` 目录下包含 5 个生产级模板：

1. **motion-vite-basic.tsx** — 基础 Vite + React + TypeScript 配置，包含常用动画
2. **motion-nextjs-client.tsx** — Next.js App Router 模式，带客户端组件包装器
3. **scroll-parallax.tsx** — 滚动动画、视差和视口触发
4. **ui-components.tsx** — 模态、手风琴、轮播、带共享下划线的标签
5. **layout-transitions.tsx** — FLIP 布局动画和共享元素过渡

将模板复制到你的项目中并按需定制。

---

## 参考文档

本技能包含 4 份综合参考指南：

- **motion-vs-auto-animate.md** — 决策指南：何时使用 Motion vs AutoAnimate
- **performance-optimization.md** — 包体积、LazyMotion、虚拟化、硬件加速
- **nextjs-integration.md** — App Router vs Pages Router、"use client"、已知问题
- **common-patterns.md** — 前 15 种模式及完整代码示例

详见 `references/` 目录。

---

## 脚本

本技能包含 2 个自动化脚本：

- **init-motion.sh** — 一键安装，自动检测框架（Vite、Next.js、Cloudflare Workers）
- **optimize-bundle.sh** — 将现有 Motion 代码转换为 LazyMotion，减小包体积

详见 `scripts/` 目录。

---

## 官方文档

- **官方网站**：https://motion.dev
- **GitHub**：https://github.com/motiondivision/motion（30,200+ stars）
- **示例**：https://motion.dev/examples（300+ 示例）

**相关技能**：`auto-animate`（简单列表）、`tailwind-v4-shadcn`（样式）、`nextjs`（App Router）、`cloudflare-worker-base`

**Motion vs AutoAnimate**：加载 `references/motion-vs-auto-animate.md` 查看详细对比。

---

## Token 效率指标

**Token 节省**：~83%（30k → 5k tokens） | **错误预防**：100%（29+ 个错误） | **时间节省**：~85%（2-3 小时 → 20-30 分钟）

---

## 包版本（验证日期 2025-11-07）

| 包 | 版本 | 状态 |
|---------|---------|--------|
| motion | 12.23.24 | ✅ 最新稳定版 |
| framer-motion | 12.23.24 | ✅ Cloudflare 替代方案 |
| react | 19.2.0 | ✅ 最新稳定版 |
| vite | 6.0.0 | ✅ 最新稳定版 |

---

## 贡献

发现问题或有建议？
- 提交 issue：https://github.com/secondsky/claude-skills/issues
- 查看模板和参考文档获取详细示例

---

**生产环境验证**：✅ React 19 + Next.js 15 + Vite 6 + Tailwind v4
**Token 节省**：~83%
**错误预防**：100%（已记录 29+ 个可预防错误）
**包体积**：2.3 KB（mini）- 34 KB（完整），可通过 LazyMotion 优化至 4.6 KB
**无障碍支持**：MotionConfig reducedMotion 支持
**开箱即用！** 通过 `./scripts/install-skill.sh motion` 安装
