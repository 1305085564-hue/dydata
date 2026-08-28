import test from "node:test";
import assert from "node:assert/strict";

import { buildContentReviewReadiness } from "./content-review-readiness";

test("buildContentReviewReadiness 在缺拆段时保留内部分析入口", () => {
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "先说结论，再拆原因，最后给操作建议。" },
    hasSnapshot24h: true,
    hasSegments: false,
    hasAnalysis: false,
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
    hasAnalysis: false,
  });

  assert.equal(readiness.status, "missing_snapshot");
  assert.equal(readiness.can_generate, false);
});

test("buildContentReviewReadiness 将已有内部分析与数据完整度分开表达", () => {
  const readiness = buildContentReviewReadiness({
    video: { id: "video-1", content: "已有文案" },
    hasSnapshot24h: true,
    hasSegments: true,
    hasAnalysis: true,
  });

  assert.equal(readiness.status, "analyzed");
  assert.equal(readiness.label, "已有分析");
  assert.equal(readiness.has_analysis, true);
  assert.equal(readiness.can_generate, true);
});
