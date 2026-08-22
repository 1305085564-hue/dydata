import assert from "node:assert/strict";
import test from "node:test";

import {
  logApiError,
  logApiRequest,
  redactSensitive,
  resolveRequestId,
} from "./api-logger";

test("敏感键一律脱敏，包括嵌套对象", () => {
  const redacted = redactSensitive({
    route: "/api/video-submit",
    authorization: "Bearer abc",
    access_token: "t",
    CRON_SECRET: "s",
    password: "p",
    api_key: "k",
    cookie: "c",
    nested: { refresh_token: "rt", safe: 1 },
  });

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.access_token, "[REDACTED]");
  assert.equal(redacted.CRON_SECRET, "[REDACTED]");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.api_key, "[REDACTED]");
  assert.equal(redacted.cookie, "[REDACTED]");
  assert.deepEqual(redacted.nested, { refresh_token: "[REDACTED]", safe: 1 });
});

test("数组内的对象同样递归脱敏", () => {
  const redacted = redactSensitive({
    detail: {
      items: [{ token: "leak-me", route: "/api/x" }, "plain", 42],
    },
  });

  const items = (redacted.detail as { items: Array<Record<string, unknown> | string | number> }).items;
  assert.deepEqual(items[0], { token: "[REDACTED]", route: "/api/x" });
  assert.equal(items[1], "plain");
  assert.equal(items[2], 42);
});

test("非敏感字段原样保留", () => {
  const redacted = redactSensitive({ route: "/api/remind", status: 200 });
  assert.deepEqual(redacted, { route: "/api/remind", status: 200 });
});

test("resolveRequestId 复用外部 x-request-id", () => {
  const request = new Request("https://dydata.cc/api/health", {
    headers: { "x-request-id": "req-123" },
  });
  assert.equal(resolveRequestId(request), "req-123");
});

test("resolveRequestId 缺头时生成 UUID 且截断超长外部 id", () => {
  const generated = resolveRequestId(new Request("https://dydata.cc/api/health"));
  assert.match(generated, /^[0-9a-f-]{36}$/);

  const longId = "x".repeat(100);
  const truncated = resolveRequestId(
    new Request("https://dydata.cc/api/health", {
      headers: { "x-request-id": longId },
    }),
  );
  assert.equal(truncated.length, 64);
});

test("结构化日志输出单行 JSON 且不含敏感值", () => {
  const lines: string[] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (line: string) => lines.push(line);
  console.error = (line: string) => lines.push(line);

  try {
    logApiRequest({
      requestId: "req-1",
      route: "/api/remind",
      method: "GET",
      status: 500,
      userId: "user-1",
      detail: { secret: "should-not-leak", reason: "non_2xx" },
    });
    logApiError(
      { requestId: "req-2", route: "/api/health" },
      new Error("boom"),
    );
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.equal(lines.length, 2);
  for (const line of lines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.equal(parsed.kind, "api");
    assert.ok(typeof parsed.requestId === "string");
  }
  const first = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.equal(first.level, "info");
  assert.equal(first.userId, "user-1");
  assert.deepEqual(first.detail, { secret: "[REDACTED]", reason: "non_2xx" });

  const second = JSON.parse(lines[1] ?? "{}") as Record<string, unknown>;
  assert.equal(second.level, "error");
  assert.equal(second.error, "boom");
});
