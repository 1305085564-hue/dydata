import assert from "node:assert/strict";
import test from "node:test";

import {
  checkApiRateLimit,
  isApiRateLimitExempt,
  resolveApiRateLimitRule,
  __internal,
} from "./api-rate-limit";

function withProductionEnv(fn: () => Promise<void> | void) {
  return async () => {
    const env = process.env as Record<string, string | undefined>;
    const originalEnv = env.NODE_ENV;
    const originalUrl = env.UPSTASH_REDIS_REST_URL;
    const originalToken = env.UPSTASH_REDIS_REST_TOKEN;

    env.NODE_ENV = "production";
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    __internal.resetMemoryStore();

    try {
      await fn();
    } finally {
      if (originalEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = originalEnv;
      if (originalUrl === undefined) delete env.UPSTASH_REDIS_REST_URL;
      else env.UPSTASH_REDIS_REST_URL = originalUrl;
      if (originalToken === undefined) delete env.UPSTASH_REDIS_REST_TOKEN;
      else env.UPSTASH_REDIS_REST_TOKEN = originalToken;
      __internal.resetMemoryStore();
    }
  };
}

test("AI 成本接口按端点收紧限制", () => {
  assert.deepEqual(resolveApiRateLimitRule("/api/ocr-screenshot").rule, { limit: 10, windowMs: 60_000 });
  assert.deepEqual(resolveApiRateLimitRule("/api/rewrite/generate").rule, { limit: 10, windowMs: 60_000 });
  assert.deepEqual(resolveApiRateLimitRule("/api/video-submit").rule, { limit: 20, windowMs: 60_000 });
  // 批量复盘
  assert.deepEqual(resolveApiRateLimitRule("/api/admin/next-day-review/batch").rule, { limit: 10, windowMs: 60_000 });
  // 其余 API 走兜底
  assert.deepEqual(resolveApiRateLimitRule("/api/dashboard/trend").rule, { limit: 120, windowMs: 60_000 });
});

test("cron / 外部回调路径豁免限流（它们各自有密钥鉴权）", () => {
  assert.equal(isApiRateLimitExempt("/api/supabase-keepalive"), true);
  assert.equal(isApiRateLimitExempt("/api/notifications/cleanup"), true);
  assert.equal(isApiRateLimitExempt("/api/remind"), true);
  assert.equal(isApiRateLimitExempt("/api/smart-alert"), true);
  assert.equal(isApiRateLimitExempt("/api/smart-alert/notify"), true);
  assert.equal(isApiRateLimitExempt("/api/admin/first-screen-monitor"), true);
  assert.equal(isApiRateLimitExempt("/api/feishu/event"), true);
  assert.equal(isApiRateLimitExempt("/api/health"), true);
  assert.equal(isApiRateLimitExempt("/api/auth/login"), true);
  // AI 成本接口不豁免
  assert.equal(isApiRateLimitExempt("/api/ocr-screenshot"), false);
  assert.equal(isApiRateLimitExempt("/api/video-submit"), false);
});

test(
  "内存降级：同一用户超过端点限额后被拦，其他用户不受影响",
  withProductionEnv(async () => {
    const identifier = "user:11111111-1111-1111-1111-111111111111";

    for (let i = 0; i < 10; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/ocr-screenshot", identifier });
      assert.equal(result.allowed, true, `第 ${i + 1} 次应放行`);
    }

    const blocked = await checkApiRateLimit({ pathname: "/api/ocr-screenshot", identifier });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.limit, 10);
    assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= 60);

    // 其他用户独立计数
    const otherUser = await checkApiRateLimit({
      pathname: "/api/ocr-screenshot",
      identifier: "user:22222222-2222-2222-2222-222222222222",
    });
    assert.equal(otherUser.allowed, true);

    // 不同端点独立计数
    const otherEndpoint = await checkApiRateLimit({ pathname: "/api/video-submit", identifier });
    assert.equal(otherEndpoint.allowed, true);
    assert.equal(otherEndpoint.limit, 20);
  }),
);

test("内存降级：未登录请求按 IP 计数", withProductionEnv(async () => {
  for (let i = 0; i < 120; i++) {
    const result = await checkApiRateLimit({ pathname: "/api/export", identifier: "ip:203.0.113.7" });
    assert.equal(result.allowed, true, `第 ${i + 1} 次应放行`);
  }
  const blocked = await checkApiRateLimit({ pathname: "/api/export", identifier: "ip:203.0.113.7" });
  assert.equal(blocked.allowed, false);
}));

test("开发环境不限流", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  env.NODE_ENV = "development";
  try {
    for (let i = 0; i < 30; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/ocr-screenshot", identifier: "user:dev" });
      assert.equal(result.allowed, true);
    }
  } finally {
    if (originalEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalEnv;
  }
});

test("Upstash 主存储：跨实例计数生效并返回 Retry-After", withProductionEnv(async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
  let evalCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    evalCalls += 1;
    const body = JSON.parse(String(init?.body)) as [string, string, string];
    assert.equal(init?.method, "POST");
    assert.ok(String(_input).endsWith("/eval"));
    assert.equal(body[2], `ratelimit:/api/rewrite/generate:user:33333333-3333-3333-3333-333333333333`);

    const count = evalCalls;
    return new Response(JSON.stringify({ result: count <= 10 ? [count, 45_000] : [count, 12_340] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const identifier = "user:33333333-3333-3333-3333-333333333333";
    for (let i = 0; i < 10; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/rewrite/generate", identifier });
      assert.equal(result.allowed, true);
    }
    const blocked = await checkApiRateLimit({ pathname: "/api/rewrite/generate", identifier });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfter, 13); // ceil(12340/1000)
    assert.ok(evalCalls >= 11);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test("Upstash 故障时降级内存限流且不放飞（fail-open 到本地计数）", withProductionEnv(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    const identifier = "user:44444444-4444-4444-4444-444444444444";
    for (let i = 0; i < 20; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/video-submit", identifier });
      assert.equal(result.allowed, true, `第 ${i + 1} 次应放行`);
    }
    const blocked = await checkApiRateLimit({ pathname: "/api/video-submit", identifier });
    assert.equal(blocked.allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test("Upstash 请求必须带超时信号，避免悬挂拖垮 middleware", withProductionEnv(async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

  const originalFetch = globalThis.fetch;
  let seenSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_input, init) => {
    seenSignal = init?.signal;
    return new Response(JSON.stringify({ result: [1, 60_000] }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await checkApiRateLimit({ pathname: "/api/export", identifier: "ip:203.0.113.9" });
    assert.equal(result.allowed, true);
    assert.ok(seenSignal instanceof AbortSignal, "fetch 必须携带 AbortSignal 超时信号");
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test("Upstash 返回非法 JSON 时降级内存限流，不让 middleware 500", withProductionEnv(async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html>Bad Gateway</html>", { status: 200 })) as typeof fetch;

  try {
    const identifier = "user:55555555-5555-5555-5555-555555555555";
    for (let i = 0; i < 10; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/ocr-screenshot", identifier });
      assert.equal(result.allowed, true, `第 ${i + 1} 次应放行（降级内存计数）`);
    }
    const blocked = await checkApiRateLimit({ pathname: "/api/ocr-screenshot", identifier });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.limit, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

test("Upstash 返回结构异常时降级内存限流且不放飞", withProductionEnv(async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "UPSTASH_REST_ERROR" }), { status: 200 })) as typeof fetch;

  try {
    const identifier = "user:66666666-6666-6666-6666-666666666666";
    for (let i = 0; i < 20; i++) {
      const result = await checkApiRateLimit({ pathname: "/api/video-submit", identifier });
      assert.equal(result.allowed, true, `第 ${i + 1} 次应放行`);
    }
    const blocked = await checkApiRateLimit({ pathname: "/api/video-submit", identifier });
    assert.equal(blocked.allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));
