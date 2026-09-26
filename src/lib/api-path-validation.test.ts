import test from "node:test";
import assert from "node:assert/strict";

import { hasInvalidUuidPathParameter } from "./api-path-validation";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

test("动态 API 记录 ID 必须是 UUID", () => {
  assert.equal(hasInvalidUuidPathParameter(`/api/notifications/${VALID_UUID}/read`), false);
  assert.equal(hasInvalidUuidPathParameter("/api/notifications/not-an-id/read"), true);
  // 文案助手相关接口已下线，其 UUID 校验规则一并移除，不再命中
  assert.equal(hasInvalidUuidPathParameter("/api/rewrite/documents/nope/revisions"), false);
  assert.equal(hasInvalidUuidPathParameter(`/api/topics/sub-topics/${VALID_UUID}/claim`), false);
  assert.equal(hasInvalidUuidPathParameter(`/api/topics/sub-topics/${VALID_UUID}/claims`), false);
  assert.equal(hasInvalidUuidPathParameter("/api/topics/sub-topics/not-an-id/claims"), true);
});

test("静态路由和非 UUID 业务键不被误判", () => {
  assert.equal(hasInvalidUuidPathParameter("/api/admin/ai-features/ocr_screenshot"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/topics/sub-topics/suggest"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/topics/sub-topics/from-recommendation"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/dashboard/content-feedback-cards/not-an-id"), false);
  assert.equal(hasInvalidUuidPathParameter("/api/admin/content-feedback-cards/not-an-id"), false);
});
