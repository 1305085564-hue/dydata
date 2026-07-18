import test from "node:test";
import assert from "node:assert/strict";

import { hasInvalidUuidPathParameter } from "./api-path-validation";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

test("动态 API 记录 ID 必须是 UUID", () => {
  assert.equal(hasInvalidUuidPathParameter(`/api/notifications/${VALID_UUID}/read`), false);
  assert.equal(hasInvalidUuidPathParameter("/api/notifications/not-an-id/read"), true);
  assert.equal(hasInvalidUuidPathParameter("/api/rewrite/documents/nope/revisions"), true);
  assert.equal(hasInvalidUuidPathParameter(`/api/topics/sub-topics/${VALID_UUID}/claim`), false);
  assert.equal(hasInvalidUuidPathParameter("/api/violations/not-an-id/review"), true);
});

test("静态路由和非 UUID 业务键不被误判", () => {
  assert.equal(hasInvalidUuidPathParameter("/api/violations/dashboard-summary"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/violations/visual-tags"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/admin/ai-features/growth_insight"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/topics/sub-topics/suggest"), false);
});
