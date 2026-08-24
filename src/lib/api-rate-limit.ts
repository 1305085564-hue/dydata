/**
 * API 限流（按「端点 × 用户/IP」计数，保护 AI 成本接口）
 *
 * 存储分层：
 * - 主存储：Upstash Redis REST（跨 Vercel 实例生效）。Edge middleware 里用 fetch 调用，
 *   需配置 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN。
 * - 降级：未配置或 Redis 故障时退回单实例内存限流（尽力而为），并打警告日志。
 *
 * 未配置 Upstash 时限流只在单个实例内生效——这是已知的降级状态，不是完整方案；
 * 部署前置条件见 .env.example 与 docs/全站模块地图.md。
 */

export interface ApiRateLimitResult {
  allowed: boolean;
  retryAfter: number;
  limit: number;
}

interface EndpointRule {
  limit: number;
  windowMs: number;
}

// AI 成本接口优先保护：按端点收紧
const AI_COST_RULES: Array<{ prefix: string; rule: EndpointRule }> = [
  { prefix: "/api/ocr-screenshot", rule: { limit: 20, windowMs: 60_000 } },
  { prefix: "/api/rewrite/generate", rule: { limit: 10, windowMs: 60_000 } },
  { prefix: "/api/video-submit", rule: { limit: 20, windowMs: 60_000 } },
  // 批量复盘入口（含 /api/admin/next-day-review/batch）
  { prefix: "/api/admin/next-day-review", rule: { limit: 10, windowMs: 60_000 } },
];

// 其余 API 的兜底限制（防失控循环，不影响正常页面首屏并发）
const DEFAULT_API_RULE: EndpointRule = { limit: 120, windowMs: 60_000 };

// cron / 外部回调等机器调用路径豁免（它们各自有密钥鉴权）
const EXEMPT_PATHS = new Set([
  "/api/supabase-keepalive",
  "/api/notifications/cleanup",
  "/api/remind",
  "/api/smart-alert",
  "/api/smart-alert/notify",
  "/api/admin/first-screen-monitor",
  "/api/feishu/event",
  // 健康检查：故障时探活频率可能升高，不能被限流挡住
  "/api/health",
]);

export function isApiRateLimitExempt(pathname: string): boolean {
  if (EXEMPT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

export function resolveApiRateLimitRule(pathname: string): {
  bucket: string;
  rule: EndpointRule;
} {
  const matched = AI_COST_RULES.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  );
  if (matched) {
    return { bucket: matched.prefix, rule: matched.rule };
  }
  return { bucket: "default", rule: DEFAULT_API_RULE };
}

interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): Promise<ApiRateLimitResult>;
}

const INCR_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

class UpstashStore implements RateLimitStore {
  // Upstash 不可用时必须快速降级，不能让限流检查拖垮请求本身
  static readonly REQUEST_TIMEOUT_MS = 3_000;

  constructor(
    private url: string,
    private token: string,
  ) {}

  async hit(key: string, limit: number, windowMs: number): Promise<ApiRateLimitResult> {
    let response: Response;
    try {
      response = await fetch(`${this.url}/eval`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([INCR_WINDOW_SCRIPT, "1", key, String(windowMs)]),
        signal: AbortSignal.timeout(UpstashStore.REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error("[api-rate-limit] Upstash 请求失败或超时，降级内存限流", error);
      return memoryStore.hit(key, limit, windowMs);
    }

    if (!response.ok) {
      console.error(`[api-rate-limit] Upstash 返回 ${response.status}，降级内存限流`);
      return memoryStore.hit(key, limit, windowMs);
    }

    let payload: { result?: [number, number] | null };
    try {
      payload = (await response.json()) as { result?: [number, number] | null };
    } catch (error) {
      console.error("[api-rate-limit] Upstash 响应解析失败，降级内存限流", error);
      return memoryStore.hit(key, limit, windowMs);
    }

    const result = payload.result;
    if (!Array.isArray(result) || result.length < 2) {
      console.error("[api-rate-limit] Upstash 返回格式异常，降级内存限流");
      return memoryStore.hit(key, limit, windowMs);
    }

    const [count, pttl] = result;
    if (count <= limit) {
      return { allowed: true, retryAfter: 0, limit };
    }
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000)),
      limit,
    };
  }
}

const MEMORY_MAX_ENTRIES = 10_000;
const memoryEntries = new Map<string, { count: number; resetTime: number }>();

const memoryStore: RateLimitStore = {
  hit(key, limit, windowMs) {
    const now = Date.now();
    const entry = memoryEntries.get(key);

    if (!entry || now >= entry.resetTime) {
      if (!entry) {
        // Map 保持插入序：新 key 满员时淘汰最旧
        if (memoryEntries.size >= MEMORY_MAX_ENTRIES) {
          const oldest = memoryEntries.keys().next();
          if (!oldest.done) memoryEntries.delete(oldest.value);
        }
      }
      memoryEntries.delete(key);
      memoryEntries.set(key, { count: 1, resetTime: now + windowMs });
      return Promise.resolve({ allowed: true, retryAfter: 0, limit });
    }

    entry.count += 1;
    if (entry.count > limit) {
      return Promise.resolve({
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((entry.resetTime - now) / 1000)),
        limit,
      });
    }
    return Promise.resolve({ allowed: true, retryAfter: 0, limit });
  },
};

let warnedMissingUpstash = false;

function getStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return new UpstashStore(url, token);
  }
  if (!warnedMissingUpstash && process.env.NODE_ENV !== "development") {
    warnedMissingUpstash = true;
    console.warn(
      "[api-rate-limit] 未配置 UPSTASH_REDIS_REST_URL/TOKEN，API 限流降级为单实例内存模式（跨 Vercel 实例不生效）",
    );
  }
  return memoryStore;
}

export async function checkApiRateLimit(params: {
  pathname: string;
  identifier: string; // 形如 "user:<uuid>" 或 "ip:<addr>"
}): Promise<ApiRateLimitResult> {
  if (process.env.NODE_ENV === "development") {
    return { allowed: true, retryAfter: 0, limit: Number.POSITIVE_INFINITY };
  }

  const { bucket, rule } = resolveApiRateLimitRule(params.pathname);
  return getStore().hit(`ratelimit:${bucket}:${params.identifier}`, rule.limit, rule.windowMs);
}

export const __internal = {
  resetMemoryStore: () => memoryEntries.clear(),
};
