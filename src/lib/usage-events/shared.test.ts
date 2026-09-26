import assert from "node:assert/strict";
import test from "node:test";

import {
  isTrackedUsagePath,
  normalizeUsagePath,
  parseUsageEventPayload,
} from "./shared";

test("normalizeUsagePath trims slashes and folds detail UUID paths", () => {
  assert.equal(normalizeUsagePath("admin/content/123e4567-e89b-12d3-a456-426614174000/"), "/admin/content/[id]");
  assert.equal(normalizeUsagePath("/admin/content/"), "/admin/content");
});

test("isTrackedUsagePath only keeps logged-in product pages", () => {
  assert.equal(isTrackedUsagePath("/dashboard"), true);
  assert.equal(isTrackedUsagePath("/admin/content"), true);
  assert.equal(isTrackedUsagePath("/login"), false);
  assert.equal(isTrackedUsagePath("/content-tools/rewrite"), false);
});

test("parseUsageEventPayload accepts supported events and normalizes path", () => {
  const parsed = parseUsageEventPayload({
    path: " /dashboard/ ",
    eventType: "page_view",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.data, {
    path: "/dashboard",
    eventType: "page_view",
  });
});

test("parseUsageEventPayload rejects unsupported event names", () => {
  const parsed = parseUsageEventPayload({
    path: "/dashboard",
    eventType: "other_event",
  });

  assert.equal(parsed.ok, false);
});

test("文案助手已下线：rewrite_generate 事件与 /content-tools 路径均不再被接受", () => {
  const removedEvent = parseUsageEventPayload({
    path: "/dashboard",
    eventType: "rewrite_generate",
  });
  assert.equal(removedEvent.ok, false);

  const removedPath = parseUsageEventPayload({
    path: "/content-tools/rewrite",
    eventType: "page_view",
  });
  assert.equal(removedPath.ok, false);
});
