import test from "node:test";
import assert from "node:assert/strict";

import { buildContentReviewReadiness } from "./content-review-readiness";

test("buildContentReviewReadiness 在缺拆段时标记数据不完整", () => {
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "先说结论，再拆原因，最后给操作建议。" },
    hasSnapshot24h: true,
    hasSegments: false,
  });

  assert.equal(readiness.status, "missing_segments");
  assert.equal(readiness.label, "缺拆段");
  assert.equal(readiness.can_generate, true);
});

test("buildContentReviewReadiness 在缺24h数据时阻止生成", () => {
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "已有文案" },
    hasSnapshot24h: false,
    hasSegments: true,
  });

  assert.equal(readiness.status, "missing_snapshot");
  assert.equal(readiness.can_generate, false);
});

test("buildContentReviewReadiness 数据齐全时标记 ready", () => {
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "已有文案" },
    hasSnapshot24h: true,
    hasSegments: true,
  });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.label, "数据齐全");
  assert.equal(readiness.can_generate, true);
});
