import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONTENT_LIST_FILTERS } from "@/lib/content/domain/content-list-filters";
import { activeSegmentOf, segmentBaseKey, segmentCountText, segmentFilterPatch } from "./content-segments";

test("分段互斥：选评级会关掉只看异常，选异常会清掉评级", () => {
  assert.deepEqual(segmentFilterPatch("excellent"), { onlyAnomaly: false, qualityGrade: "excellent" });
  assert.deepEqual(segmentFilterPatch("anomaly"), { onlyAnomaly: true, qualityGrade: "all" });
  assert.deepEqual(segmentFilterPatch("all"), { onlyAnomaly: false, qualityGrade: "all" });
  assert.equal(activeSegmentOf({ onlyAnomaly: true, qualityGrade: "all" }), "anomaly");
  assert.equal(activeSegmentOf({ onlyAnomaly: false, qualityGrade: "good" }), "good");
  assert.equal(activeSegmentOf({ onlyAnomaly: false, qualityGrade: "all" }), "all");
});

test("计数底只看分段以外的条件：切分段不换底，换负责人才换底", () => {
  const base = segmentBaseKey(DEFAULT_CONTENT_LIST_FILTERS, "all");
  assert.equal(segmentBaseKey({ ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "excellent" }, "all"), base);
  assert.equal(segmentBaseKey({ ...DEFAULT_CONTENT_LIST_FILTERS, onlyAnomaly: true }, "all"), base);
  assert.notEqual(segmentBaseKey({ ...DEFAULT_CONTENT_LIST_FILTERS, userId: "u-1" }, "all"), base);
});

test("「全部」的篇数在页头说，分段上不重复；计数未知时不显示数字", () => {
  const counts = { all: 23, excellent: 3, good: 5, fair: 12, unrated: 1, anomaly: 2 };
  assert.equal(segmentCountText("all", counts), null);
  assert.equal(segmentCountText("excellent", counts), "3");
  assert.equal(segmentCountText("excellent", null), null);
});
