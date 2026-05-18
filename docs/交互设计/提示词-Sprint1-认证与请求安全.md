# 提示词：Sprint 1 — 认证与请求安全

## 你的身份
你是 DYData（抖音数据日报平台）的资深全栈开发工程师，精通 Next.js App Router + Supabase + TypeScript。

## 任务背景
项目当前存在一个严重问题：`middleware.ts` 中的 `hasSupabaseAuthCookie()` 只检查 cookie 是否存在，不验证 token 是否过期。导致用户 token 过期后仍能进入页面，但所有 API 请求返回 401，页面白屏或报错。

## 任务清单（按顺序执行）

### 任务 1：middleware 增加 token 有效性校验

**目标**：让过期的 token 在 middleware 层就被拦截，重定向到登录页。

**文件**：`src/middleware.ts`

**要求**：
1. 在现有 `hasSupabaseAuthCookie()` 检查之后，增加 token 有效性校验
2. 使用 Supabase 的 `createServerClient` 从 cookie 中解析 session，检查是否过期
3. 如果 session 无效或过期，清除相关 cookie 后重定向到 `/login?expired=1`
4. **不要破坏现有逻辑**：无 cookie 时仍走原逻辑，有 cookie 但无效时才新增拦截
5. 保持 middleware 轻量，避免引入过重的依赖

**验收标准**：
- 正常登录用户可以正常访问 dashboard 和 admin
- token 过期后（可手动删除/修改 cookie 测试），访问 dashboard 会被重定向到 `/login?expired=1`
- middleware 执行时间增加不超过 50ms

---

### 任务 2：登录页增加「会话过期」提示

**目标**：用户被重定向回来时，知道发生了什么。

**文件**：`src/app/(auth)/login/login-form.tsx`

**要求**：
1. 读取 URL 参数 `expired=1`
2. 存在时，在表单上方显示黄色警告条：「登录会话已过期，请重新登录」
3. 使用项目现有颜色令牌：`#D99E55`（warning 色）
4. 提示条可手动关闭（X 按钮），关闭后不再显示
5. 关闭状态不持久化（刷新后如果 URL 还有参数则重新显示）

**验收标准**：
- 直接访问 `/login?expired=1` 能看到黄色提示条
- 提示条不影响表单正常提交
- 关闭后页面整洁

---

### 任务 3：封装 `fetchWithTimeout` 工具

**目标**：所有异步请求都有超时保护，避免永久 loading。

**文件**：新建 `src/lib/fetch-timeout.ts`

**要求**：
1. 导出一个函数 `fetchWithTimeout(url, options, timeoutMs = 30000)`
2. 内部使用 `AbortController`，超时后自动 abort
3. 超时后抛出的 Error message 为 `"请求超时，请检查网络后重试"`
4. 支持原 fetch 的所有参数（headers、body、method 等）
5. 如果调用方自己传了 `signal`，需要同时监听两个 signal（超时 signal + 用户 signal），任一触发都 abort
6. 导出第二个函数 `fetchWithTimeoutJSON`，自动处理 `res.json()`，同样带超时

**类型签名**：
```typescript
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs?: number
): Promise<Response>;

export async function fetchWithTimeoutJSON<T>(
  url: string,
  options?: RequestInit,
  timeoutMs?: number
): Promise<T>;
```

**验收标准**：
- 正常请求不受影响
- 超时请求（可 mock 一个 60s 延迟的接口测试）在 30s 后抛出超时错误
- 用户传入 signal 也能正确工作

---

### 任务 4：替换 admin 高频页面的裸 fetch

**目标**：把管理后台中使用裸 fetch 的地方替换为 `fetchWithTimeout`。

**文件**：
- `src/app/(app)/admin/components/admin-cockpit.tsx`（useSafeFetch hook 内部）
- `src/app/(app)/admin/ai-assistant/chat-panel.tsx`
- `src/app/(app)/admin/conversion-hub/tabs/violations-tab.tsx`
- `src/app/(app)/admin/ai-channels/ai-channels-client.tsx`

**要求**：
1. 每个文件的每个 `fetch()` 调用都替换为 `fetchWithTimeout`
2. 保持原有错误处理逻辑不变，只是增加超时保护
3. 如果原有代码有 `try/catch`，超时错误会被 catch 到，显示原有错误提示
4. 不要改变任何 UI 或交互逻辑，只做替换

**验收标准**：
- 以上 4 个文件中没有裸 `fetch()` 调用（全局搜索确认）
- 网络正常时功能完全一致
- 网络卡顿时（可用 Chrome DevTools 模拟 Slow 3G + 超时测试）显示超时错误而非永久 loading

---

## 关键约束

1. **不要修改 .env 文件**
2. **不要修改数据库 migration**
3. **所有改动必须保持 TypeScript 类型正确**
4. **使用项目现有设计令牌和组件**（feedbackToast、ConfirmDialog、Skeleton 等）
5. **改完后运行 `npm run build` 确认无编译错误**

## 自测 checklist

- [ ] middleware 改完后，正常用户能正常访问
- [ ] 删除/修改 cookie 后，访问 dashboard 被重定向到 `/login?expired=1`
- [ ] `/login?expired=1` 显示黄色提示条
- [ ] `fetchWithTimeout` 超时测试通过
- [ ] admin 各页面功能正常
- [ ] `npm run build` 无错误

## 输出要求

完成后，返回以下信息：
1. 每个任务的修改文件列表
2. 遇到的任何问题及解决方案
3. 是否需要我（复核者）特别关注的地方
