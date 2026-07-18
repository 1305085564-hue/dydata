/**
 * 基于内存的简单 IP 速率限制器
 * 规则：同一 IP 在 10 秒内最多 20 次请求
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 10_000; // 10 秒
const MAX_REQUESTS = 20;
const MAX_STORE_SIZE = 10_000;

function deleteOldestEntry() {
  const oldest = store.keys().next();
  if (!oldest.done) {
    store.delete(oldest.value);
  }
}

function pruneOneExpiredEntry(now: number) {
  const oldest = store.keys().next();
  if (oldest.done) return;

  const entry = store.get(oldest.value);
  if (entry && now >= entry.resetTime) {
    store.delete(oldest.value);
  }
}

/**
 * 检查 IP 是否超过速率限制
 * @returns { allowed: boolean; retryAfter: number }
 *   - allowed: 是否允许继续请求
 *   - retryAfter: 若被限制，多少秒后恢复
 */
export function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  if (process.env.NODE_ENV === "development") {
    return { allowed: true, retryAfter: 0 };
  }

  const now = Date.now();
  pruneOneExpiredEntry(now);
  const entry = store.get(ip);

  if (entry && now < entry.resetTime) {
    if (entry.count >= MAX_REQUESTS) {
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.min(Math.ceil((entry.resetTime - now) / 1_000), WINDOW_MS / 1_000),
        ),
      };
    }

    entry.count += 1;
    return { allowed: true, retryAfter: 0 };
  }

  // Map 覆盖已有 key 不会改变插入顺序；新窗口必须先删除再放到队尾。
  if (entry) {
    store.delete(ip);
  }

  if (store.size >= MAX_STORE_SIZE) {
    deleteOldestEntry();
  }

  store.set(ip, { count: 1, resetTime: now + WINDOW_MS });
  return { allowed: true, retryAfter: 0 };
}

/**
 * 以下路径不参与限流
 */
export function isRateLimitExempt(pathname: string): boolean {
  // 登录注册相关
  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth/")) {
    return true;
  }
  // 静态资源
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|eot|json|xml|txt|map)$/.test(pathname)
  ) {
    return true;
  }
  return false;
}

export const __internal = {
  WINDOW_MS,
  MAX_STORE_SIZE,
  getStoreSize: () => store.size,
  getEntry: (key: string) => store.get(key),
  getKeys: () => Array.from(store.keys()),
  hasKey: (key: string) => store.has(key),
  resetStore: () => store.clear(),
};
