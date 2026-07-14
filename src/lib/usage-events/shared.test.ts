import assert from "node:assert/strict";
import test from "node:test";

import {
  isTrackedUsagePath,
  normalizeUsagePath,
  parseUsageEventPayload,
} from "./shared";

test("normalizeUsagePath trims slashes and folds detail UUID paths", () => {
  assert.equal(normalizeUsagePath("violations/123e4567-e89b-12d3-a456-426614174000/"), "/violations/[id]");
  assert.equal(normalizeUsagePath("/admin/content/"), "/admin/content");
});

test("isTrackedUsagePath only keeps logged-in product pages", () => {
  assert.equal(isTrackedUsagePath("/dashboard"), true);
  assert.equal(isTrackedUsagePath("/admin/content"), true);
  assert.equal(isTrackedUsagePath("/login"), false);
});

test("parseUsageEventPayload accepts supported events and normalizes path", () => {
  const parsed = parseUsageEventPayload({
    path: " /content-tools/rewrite/ ",
    eventType: "rewrite_generate",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.data, {
    path: "/content-tools/rewrite",
    eventType: "rewrite_generate",
  });
});

test("parseUsageEventPayload rejects unsupported event names", () => {
  const parsed = parseUsageEventPayload({
    path: "/dashboard",
    eventType: "other_event",
  });

  assert.equal(parsed.ok, false);
});
