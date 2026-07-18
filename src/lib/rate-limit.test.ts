import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { __internal, checkRateLimit, isRateLimitExempt } from "./rate-limit";

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }
  Reflect.set(process.env, "NODE_ENV", value);
}

function withRateLimitClock(run: (setNow: (value: number) => void) => void) {
  const originalNow = Date.now;
  const originalNodeEnv = process.env.NODE_ENV;
  let now = 1_000;
  Date.now = () => now;
  setNodeEnv("test");
  __internal.resetStore();

  try {
    run((value) => {
      now = value;
    });
  } finally {
    Date.now = originalNow;
    setNodeEnv(originalNodeEnv);
    __internal.resetStore();
  }
}

test("同一 IP 在窗口内前 20 次放行，第 21 次限流", () => {
  withRateLimitClock(() => {
    for (let index = 0; index < 20; index += 1) {
      assert.deepEqual(checkRateLimit("ip-1"), { allowed: true, retryAfter: 0 });
    }

    const limited = checkRateLimit("ip-1");
    assert.equal(limited.allowed, false);
    assert.ok(limited.retryAfter >= 1);
    assert.ok(limited.retryAfter <= __internal.WINDOW_MS / 1_000);
  });
});

test("过期访问者按每次一个渐进清理，不全表扫描", () => {
  withRateLimitClock((setNow) => {
    checkRateLimit("ip-1");
    checkRateLimit("ip-2");
    setNow(1_000 + __internal.WINDOW_MS + 1);

    checkRateLimit("ip-3");
    assert.equal(__internal.getStoreSize(), 2);
    assert.equal(__internal.hasKey("ip-1"), false);
    assert.equal(__internal.hasKey("ip-2"), true);

    checkRateLimit("ip-4");
    assert.equal(__internal.getStoreSize(), 2);
    assert.equal(__internal.hasKey("ip-2"), false);
  });
});

test("当前 IP 窗口过期后重置计数并移到 FIFO 队尾", () => {
  withRateLimitClock((setNow) => {
    checkRateLimit("ip-1");
    checkRateLimit("ip-2");
    setNow(1_000 + __internal.WINDOW_MS);

    assert.deepEqual(checkRateLimit("ip-1"), { allowed: true, retryAfter: 0 });
    assert.equal(__internal.getEntry("ip-1")?.count, 1);
    assert.deepEqual(__internal.getKeys(), ["ip-2", "ip-1"]);
  });
});

test("容量满时每个新 IP 只淘汰一个最老项", () => {
  withRateLimitClock(() => {
    for (let index = 0; index < __internal.MAX_STORE_SIZE + 5; index += 1) {
      checkRateLimit(`ip-${index}`);
    }

    assert.equal(__internal.getStoreSize(), __internal.MAX_STORE_SIZE);
    assert.equal(__internal.hasKey("ip-0"), false);
    assert.equal(__internal.hasKey("ip-4"), false);
    assert.equal(__internal.hasKey(`ip-${__internal.MAX_STORE_SIZE + 4}`), true);
  });
});

test("容量满时已有 IP 继续访问不会触发淘汰", () => {
  withRateLimitClock(() => {
    for (let index = 0; index < __internal.MAX_STORE_SIZE; index += 1) {
      checkRateLimit(`ip-${index}`);
    }

    checkRateLimit(`ip-${__internal.MAX_STORE_SIZE - 1}`);
    assert.equal(__internal.getStoreSize(), __internal.MAX_STORE_SIZE);
    assert.equal(__internal.hasKey("ip-0"), true);
  });
});

test("开发模式旁路不写入内存 store", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  __internal.resetStore();
  setNodeEnv("development");
  try {
    assert.deepEqual(checkRateLimit("dev-ip"), { allowed: true, retryAfter: 0 });
    assert.equal(__internal.getStoreSize(), 0);
  } finally {
    setNodeEnv(originalNodeEnv);
    __internal.resetStore();
  }
});

test("限流实现不排序或展开整个 Map", () => {
  const source = readFileSync(new URL("./rate-limit.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.sort\s*\(/);
  assert.doesNotMatch(source, /\[\s*\.\.\.\s*store/);
  assert.doesNotMatch(source, /for\s*\([^)]*of\s+store/);
});

test("登录、认证和静态资源免限流，空路径不免限流", () => {
  assert.equal(isRateLimitExempt("/login"), true);
  assert.equal(isRateLimitExempt("/register"), true);
  assert.equal(isRateLimitExempt("/api/auth/callback"), true);
  assert.equal(isRateLimitExempt("/logo.svg"), true);
  assert.equal(isRateLimitExempt(""), false);
});
