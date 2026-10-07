import assert from "node:assert/strict";
import test from "node:test";

import {
  getContentPurgeTooltip,
  isContentPurgeEligible,
} from "./content-detail-lifecycle";

const now = Date.parse("2026-10-07T00:00:00.000Z");

test("回收站作品满 30 天才允许永久删除", () => {
  assert.equal(isContentPurgeEligible("2026-09-07T00:00:00.000Z", now), true);
  assert.equal(isContentPurgeEligible("2026-09-07T00:00:00.001Z", now), false);
  assert.equal(isContentPurgeEligible(null, now), false);
});

test("未满保护期时返回明确的永久删除提示", () => {
  const tooltip = getContentPurgeTooltip("2026-10-01T00:00:00.000Z", now);
  assert.match(tooltip, /未满 30 天/);
  assert.match(tooltip, /剩余约 24 天/);
  assert.equal(getContentPurgeTooltip("2026-09-01T00:00:00.000Z", now), "");
});
