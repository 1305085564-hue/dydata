# DYData Mac 风格设计底座

## 入口
- Token 文件：`src/styles/design-tokens.css`
- 全局映射：`src/app/globals.css`
- 动效工具：`src/lib/animations.ts`
- class 工具：`src/lib/tailwind-utils.ts`
- 示例组件：`src/components/ui/motion-card.tsx`

## 1. stagger 动效
直接复用 `containerVariants + itemVariants`。

```tsx
import { motion } from "framer-motion";
import { containerVariants, itemVariants } from "@/lib/animations";

export function StatGrid() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-3 md:grid-cols-3"
    >
      {["播放", "点赞", "转粉"].map((label) => (
        <motion.div key={label} variants={itemVariants}>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            {label}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

## 2. 数字滚动 useCountUp
适合播放量、增长率、榜单分数。

```tsx
"use client";

import { useCountUp } from "@/lib/animations";

export function PlayCount() {
  const { formattedValue } = useCountUp(12500, 600, true, {
    compactThreshold: 10000,
    compactDivisor: 10000,
    compactSuffix: "万",
    maximumFractionDigits: 2,
  });

  return <span className="tabular-nums text-2xl font-semibold">{formattedValue}</span>;
}
```

## 3. AI 打字机 useTypewriter
适合 AI 建议、诊断描述、生成中提示。

```tsx
"use client";

import { useTypewriter } from "@/lib/animations";

export function AiTyping() {
  const { displayText, isComplete, cursorClassName } = useTypewriter(
    "建议先优化前3秒钩子，再强化评论区互动引导。",
    25,
  );

  return (
    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
      {displayText}
      <span className={cursorClassName} aria-hidden="true" />
      {isComplete ? "" : null}
    </p>
  );
}
```

## 4. class 工具
- `cardClass(hover = true)`：标准卡片
- `buttonClass(variant, size)`：复用现有 shadcn button variants
- `glassClass()`：毛玻璃容器
- `badgeClass(color)`：语义 badge

```tsx
import { badgeClass, buttonClass, cardClass, glassClass } from "@/lib/tailwind-utils";

export function QuickExample() {
  return (
    <div className={glassClass()}>
      <div className={cardClass()}>
        <span className={badgeClass("success")}>增长中</span>
        <button className={buttonClass("default", "lg")}>查看详情</button>
      </div>
    </div>
  );
}
```

## 5. MotionCard
需要一个开箱即用的动画卡片时，直接用它。

```tsx
import { MotionCard } from "@/components/ui/motion-card";

export function OverviewCard() {
  return (
    <MotionCard index={1} className="p-4">
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-secondary)]">今日播放</p>
        <p className="text-2xl font-semibold tracking-tight">98,421</p>
      </div>
    </MotionCard>
  );
}
```

## 6. 颜色变量
优先使用语义变量：
- 背景：`--color-bg`
- 卡片：`--color-surface`
- 主色：`--color-primary`
- 成功：`--color-success`
- 风险：`--color-danger`
- 警告：`--color-warning`
- 主文案：`--color-text-primary`
- 次文案：`--color-text-secondary`
- 边框：`--color-border`

Tailwind 里可直接写：
- `bg-[var(--color-surface)]`
- `text-[var(--color-text-secondary)]`
- `border-[var(--color-border)]`
- `shadow-[var(--shadow-card)]`

## 7. 三个最常用复制片段

### 状态卡
```tsx
<MotionCard index={0} className="p-4">
  <p className="text-xs text-[var(--color-text-secondary)]">7日涨粉</p>
  <p className="mt-1 text-2xl font-semibold tracking-tight">+1,284</p>
</MotionCard>
```

### AI 建议打字机
```tsx
const { displayText, cursorClassName } = useTypewriter(text, 20);
return <span>{displayText}<span className={cursorClassName} /></span>;
```

### 上传中流光条
```tsx
<div className="relative h-2 overflow-hidden rounded-full bg-black/8">
  <div className="absolute inset-0 origin-left animate-shimmer bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)]" />
</div>
```
