import test from "node:test";
import assert from "node:assert/strict";

import { ADMIN_FIRST_SCREEN_BUDGETS, formatServerTiming } from "./admin-first-screen-contract";

test("首屏指标会格式化为 Server-Timing 响应头", () => {
  assert.equal(
    formatServerTiming({ auth: 1.25, context: 0, data: 20.04, total: 21.29 }),
    "auth;dur=1.3, context;dur=0.0, data;dur=20.0, total;dur=21.3",
  );
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.content.payloadLimit, 20);
});

test("非有限耗时不会抛异常并保留原生格式", () => {
  assert.match(formatServerTiming({ auth: Number.NaN, context: 0, data: 0, total: 0 }), /auth;dur=NaN/);
});
