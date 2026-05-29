# Dashboard 性能优化 — Codex 完整任务

## 一、背景

dydata.cc 的 Dashboard 页面加载极慢（5-10 秒才显示内容）。技术栈：Next.js App Router + Supabase（印度孟买区）+ Vercel 部署。

### 已排查出的 3 个叠加瓶颈

| 瓶颈 | 根因 | 影响 |
|------|------|------|
| RSC prefetch 风暴 | `nav-bar-client.tsx` 的 `useEffect` 对所有导航链接发起 RSC 预取（admin/settings/growth/violations），与主页面 JS 加载竞争带宽 | ~6s |
| React Hydration 错误（#418） | `NetworkStatusBar` 使用 `typeof navigator` 检测环境，但 Node.js 21+ 全局有 `navigator` 对象，导致服务端渲染了横条、客户端不渲染，DOM 结构错位，React 回退到全量客户端重渲染 | ~3-5s |
| Date hydration 不一致 | `video-submit-panel.tsx` 的 `useMemo` 和 `video-submit-form.tsx` 的 `useState` 初始化器中使用 `new Date()`，服务端和客户端时间不同 | 次要 |

### 修复前性能数据（线上 dydata.cc）

```
总加载时间：14,935ms
TTFB（服务端响应）：999ms（正常）
DOMContentLoaded：14,287ms
RSC prefetch 请求：5 个（admin 1596ms、settings 846ms、growth 690ms、violations 661ms、dashboard 1398ms）
JS 资源：45 个，多个 500-1100ms
```

### 修复后性能数据（本地 dev server）

```
总加载时间：2,854ms
DOMContentLoaded：2,854ms
RSC prefetch 请求：0 个
Hydration 错误：0 个
```

## 二、Claude 已完成的修复（4 个文件，待验收 + 推线）

改动在本地工作区，尚未 push。

### 文件 1：`src/components/nav-bar-client.tsx`

- 删除了 `useEffect` 中对所有 nav items 的 `router.prefetch()` 全量预取
- 所有 `<Link>` 组件加了 `prefetch={false}`
- 新增 `prefetchOnHover` 回调，鼠标 hover 时才触发 prefetch
- 导入了 `useCallback`

### 文件 2：`src/components/network-status-bar.tsx`

- `useState` 初始化器从 `typeof navigator !== "undefined" && !navigator.onLine` 改为固定默认值 `false` / `"online"`
- `useEffect` 中已有 `if (!navigator.onLine)` 的客户端检测逻辑，会正确处理离线状态

### 文件 3：`src/app/(app)/dashboard/video-submit-panel.tsx`

- `useMemo` 中的 `new Date()` 改为使用 `isLate` state
- 新增 `useState(false)` + `useEffect` 每分钟更新一次 `isLate`
- SSR 时默认 `isLate=false`，客户端 mount 后计算真实值

### 文件 4：`src/app/(app)/dashboard/video-submit-form.tsx`

- `createInitialMeta` 中 `uploadedAt` 从 `new Date().toLocaleString("zh-CN")` 改为空字符串 `""`
- 新增 `useEffect` 在客户端 mount 后设置真实的 `uploadedAt` 值

## 三、当前状态：线上仍然很慢

上述修复还未 push 上线。但即使上线后，预计仍有以下瓶颈：

| 瓶颈 | 耗时 | 来源 | 位置 |
|------|------|------|------|
| `content-feedback-cards` 客户端 fetch | 6132ms | `FeedbackNotificationBridge` 组件在 layout 中每次加载都请求 | `src/components/notifications/feedback-notification-bridge.tsx` → `src/app/(app)/layout.tsx` |
| `notifications` 客户端 fetch | 2982ms | `NotificationBell` 组件的 `useEffect` | `src/components/notifications/notification-bell.tsx` |
| Supabase token refresh | 799ms | `token?grant_type=refresh_token` | Supabase SDK 自动行为 |
| JS 包体积 | ~160KB+ | 多个 chunk 文件 | Next.js 构建产物 |

## 四、Codex 任务清单

### 阶段 A：验收已有修复（必须）

1. **逐文件审查上述 4 个文件的改动**
   - 没有引入新 bug（hover prefetch 逻辑、useEffect 依赖数组完整性）
   - NetworkStatusBar 改动后离线场景仍正常（useEffect 中 offline/online 事件监听完整覆盖）

2. **全局搜索可能遗漏的 hydration 错误源**
   - `grep -rn "new Date()" src/ --include="*.tsx" --include="*.ts"` 排除测试文件
   - 重点：`useMemo`、`useState` 初始化器、组件函数体顶层的 `new Date()`
   - 检查 `typeof navigator` 和 `typeof window` 在 SSR 参与的客户端组件中的使用
   - 有问题直接修

3. **给出判定**：PASS / FAIL / NEEDS_FIX，最后总结是否可以 push main

### 阶段 B：优化剩余瓶颈（重点）

4. **`content-feedback-cards` fetch 优化（6132ms）**
   - 当前 `FeedbackNotificationBridge`（`src/components/notifications/feedback-notification-bridge.tsx`）在 `(app)/layout.tsx` 中渲染，每次页面加载都 fetch `/api/dashboard/content-feedback-cards`
   - 目标：延迟到用户打开通知面板时才请求，或者用 SSR 预取
   - 注意：该组件还负责往通知中心注册复盘反馈条目，改动需保持这个功能

5. **`notifications` fetch 优化（2982ms）**
   - `NotificationBell` 组件的 `useEffect` 每次加载都 fetch
   - 同样考虑延迟加载

6. **JS 包体积优化**
   - 检查是否有大型依赖可以 tree-shake 或动态导入
   - 特别关注 `framer-motion`、`lucide-react` 等

### 阶段 C：推线

7. 验收通过 + 优化完成后，`git add` + `git commit` + `git push origin main`
8. commit message 用中文，格式参考近期 commit 风格

## 五、关键文件路径速查

```
src/components/nav-bar-client.tsx                    # 导航栏客户端组件
src/components/network-status-bar.tsx                # 网络状态横条
src/components/notifications/notification-bell.tsx   # 通知铃铛
src/components/notifications/feedback-notification-bridge.tsx  # 复盘反馈通知桥
src/app/(app)/layout.tsx                             # 应用根 layout
src/app/(app)/dashboard/page.tsx                     # Dashboard 页面（SSR）
src/app/(app)/dashboard/video-submit-panel.tsx       # 视频提交面板
src/app/(app)/dashboard/video-submit-form.tsx        # 视频提交表单
src/app/(app)/dashboard/production-control-system.tsx # Dashboard 主编排
src/lib/loaders/dashboard-page.ts                    # Dashboard 数据加载器
src/lib/dashboard-store.ts                           # Dashboard 状态管理
src/components/nav-bar-items.ts                      # 导航项配置
```

## 六、约束

- 改配置前必须备份
- 改动超过 3 个文件时先列清单确认
- Supabase 连接：mkkvnogkqcupvxmnoefy.supabase.co（印度孟买区）
- 部署平台：Vercel（push main 自动部署）
- git config user.email = 1305085564@qq.com
- 不要改 provider 的 baseUrl（会炸）
