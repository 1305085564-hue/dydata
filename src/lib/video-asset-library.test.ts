import test from "node:test";
import assert from "node:assert/strict";

import { buildVideoAssetRecord } from "./video-asset-library";

test("buildVideoAssetRecord 在资料完整且已定级时返回可入库", () => {
  const record = buildVideoAssetRecord({
    videoId: "video-1",
    videoTitle: "半导体午后回流怎么看",
    content: "先讲结论，再讲盘面分歧和资金回流。",
    hasSnapshot24h: true,
    tagCount: 4,
    segmentCount: 6,
    assetLevel: "A",
    assetNote: "可复用为午评模板",
    assetReviewedAt: "2026-05-22T10:00:00.000Z",
    assetReviewedBy: "leader-1",
  });

  assert.equal(record.completeness_status, "complete");
  assert.equal(record.library_status, "ready");
  assert.equal(record.completion_ratio, 1);
  assert.deepEqual(record.missing_fields, []);
  assert.equal(record.asset_level, "A");
  assert.equal(record.asset_note, "可复用为午评模板");
});

test("buildVideoAssetRecord 在核心资料缺失时返回待补资料", () => {
  const record = buildVideoAssetRecord({
    videoId: "video-2",
    videoTitle: "",
    content: " ",
    hasSnapshot24h: false,
    tagCount: 1,
    segmentCount: 0,
    assetLevel: null,
    assetNote: null,
    assetReviewedAt: null,
    assetReviewedBy: null,
  });

  assert.equal(record.completeness_status, "missing");
  assert.equal(record.library_status, "pending");
  assert.deepEqual(record.missing_fields, ["video_title", "content", "snapshot_24h", "content_segments"]);
});
