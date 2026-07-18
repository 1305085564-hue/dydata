import test from "node:test";
import assert from "node:assert/strict";

import { estimateSegmentTimeline } from "./timeline-alignment";
import type { ContentSegment } from "./content-segmentation";

test("文案段落按加权字数分配时长并首尾对齐", () => {
  const segments = [
    { order: 0, type: "开头钩子", text: "开头" },
    { order: 1, type: "核心观点", text: "这里是更长的核心观点" },
  ] as ContentSegment[];
  const result = estimateSegmentTimeline(segments, 30);

  assert.equal(result[0]?.estimatedStartSec, 0);
  assert.equal(result[1]?.estimatedEndSec, 30);
  assert.ok((result[0]?.estimatedEndSec ?? 0) < (result[1]?.estimatedEndSec ?? 0));
});

test("空数组返回空，0 或非法时长按段落数兜底", () => {
  assert.deepEqual(estimateSegmentTimeline([], 0), []);
  const result = estimateSegmentTimeline([{ order: 0, type: "CTA", text: "" } as ContentSegment], Number.NaN);
  assert.equal(result[0]?.estimatedEndSec, 1);
});
