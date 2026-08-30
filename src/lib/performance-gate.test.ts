import test from "node:test";
import assert from "node:assert/strict";

import {
  PERFORMANCE_ROUTE_BUDGETS,
  evaluatePerformanceRun,
  type PerformanceRequestRecord,
} from "./performance-gate";

function request(overrides: Partial<PerformanceRequestRecord> = {}): PerformanceRequestRecord {
  return {
    method: "GET",
    pathname: "/api/example",
    signature: "GET /api/example",
    status: 200,
    durationMs: 120,
    ...overrides,
  };
}

test("首批浏览器门禁覆盖四个代表页面且预算为正数", () => {
  assert.deepEqual(Object.keys(PERFORMANCE_ROUTE_BUDGETS), [
    "/topics",
    "/dashboard",
    "/admin/content",
    "/admin/collaboration",
  ]);

  for (const budget of Object.values(PERFORMANCE_ROUTE_BUDGETS)) {
    assert.ok(budget.firstPaintMs > 0);
    assert.ok(budget.completeMs >= budget.firstPaintMs);
    assert.ok(budget.requestLimit > 0);
    assert.ok(budget.apiMs > 0);
  }
});

test("HTTP 4xx/5xx、控制台错误和超出请求数会阻断门禁", () => {
  const result = evaluatePerformanceRun({
    route: "/dashboard",
    firstPaintMs: 800,
    completeMs: 1200,
    requests: [
      request({ pathname: "/api/ok", signature: "GET /api/ok" }),
      request({ pathname: "/api/fail", signature: "GET /api/fail", status: 500 }),
      ...Array.from({ length: 15 }, (_, index) => request({
        pathname: `/api/item-${index}`,
        signature: `GET /api/item-${index}`,
      })),
    ],
    consoleErrors: ["页面脚本异常"],
  });

  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "HTTP_ERROR"));
  assert.ok(result.failures.some((failure) => failure.code === "CONSOLE_ERROR"));
  assert.ok(result.failures.some((failure) => failure.code === "REQUEST_LIMIT"));
});

test("相同方法、路径和正文算重复请求，不同正文不误判", () => {
  const duplicate = evaluatePerformanceRun({
    route: "/admin/content",
    firstPaintMs: 1000,
    completeMs: 2000,
    requests: [
      request({ method: "POST", pathname: "/api/status", signature: "POST /api/status body-a" }),
      request({ method: "POST", pathname: "/api/status", signature: "POST /api/status body-a" }),
    ],
    consoleErrors: [],
  });
  const differentBodies = evaluatePerformanceRun({
    route: "/admin/content",
    firstPaintMs: 1000,
    completeMs: 2000,
    requests: [
      request({ method: "POST", pathname: "/api/status", signature: "POST /api/status body-a" }),
      request({ method: "POST", pathname: "/api/status", signature: "POST /api/status body-b" }),
    ],
    consoleErrors: [],
  });

  assert.ok(duplicate.failures.some((failure) => failure.code === "DUPLICATE_REQUEST"));
  assert.equal(differentBodies.failures.some((failure) => failure.code === "DUPLICATE_REQUEST"), false);
});

test("Topics 首屏禁止重新出现客户端 topics API", () => {
  const result = evaluatePerformanceRun({
    route: "/topics",
    firstPaintMs: 1000,
    completeMs: 1500,
    requests: [request({ pathname: "/api/topics/pool", signature: "GET /api/topics/pool" })],
    consoleErrors: [],
  });

  assert.ok(result.failures.some((failure) => failure.code === "FORBIDDEN_REQUEST"));
});

test("时间预算默认只报告，显式开启后才阻断", () => {
  const input = {
    route: "/admin/collaboration" as const,
    firstPaintMs: 3000,
    completeMs: 5000,
    requests: [request({ durationMs: 1200 })],
    consoleErrors: [],
  };

  const reportOnly = evaluatePerformanceRun(input);
  const enforced = evaluatePerformanceRun(input, { enforceTiming: true });

  assert.equal(reportOnly.passed, true);
  assert.ok(reportOnly.warnings.some((warning) => warning.code === "FIRST_PAINT_BUDGET"));
  assert.ok(reportOnly.warnings.some((warning) => warning.code === "API_BUDGET"));
  assert.equal(enforced.passed, false);
  assert.ok(enforced.failures.some((failure) => failure.code === "FIRST_PAINT_BUDGET"));
  assert.ok(enforced.failures.some((failure) => failure.code === "API_BUDGET"));
});
