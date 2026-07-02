---
name: "11-交互体验设计"
description: 通过反馈模式、微交互和可访问的交互设计创建直观的用户体验。适用于设计加载状态、错误处理 UX、动画规范或触摸交互时。
license: MIT
---

# 交互设计

通过精心设计的反馈和交互模式创建直观的用户体验。

## 交互模式

| 模式 | 时长 | 使用场景 |
|---------|----------|----------|
| 微交互 | 100-200ms | 按钮按下、开关切换 |
| 过渡动画 | 200-400ms | 页面切换、模态框 |
| 入场动画 | 300-500ms | 列表项出现 |

## 加载状态

```css
/* Skeleton loader */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

```jsx
function LoadingState({ isLoading, children }) {
  if (isLoading) {
    return <div className="skeleton" style={{ height: 200 }} />;
  }
  return children;
}
```

## 错误状态

```jsx
function ErrorState({ error, onRetry }) {
  return (
    <div className="error-container" role="alert">
      <Icon name="warning" />
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onClick={onRetry}>Try Again</button>
    </div>
  );
}
```

## 空状态

```jsx
function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <Illustration name="empty-inbox" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
```

## 可访问性

```jsx
// Announce state changes to screen readers
function StatusAnnouncer({ message }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

// Respect motion preferences
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

## 动画规范

- 动画时长控制在 500ms 以内（更长会显得拖沓）
- 入场使用 ease-out，退场使用 ease-in
- 尊重 `prefers-reduced-motion` 设置
- 确保焦点指示器始终可见
- 使用键盘导航进行测试

## 最佳实践

- 为所有操作提供即时反馈
- 等待时间超过 0.5s 时显示加载状态
- 提供清晰的错误信息及恢复选项
- 设计有意义的空状态
- 支持键盘导航
