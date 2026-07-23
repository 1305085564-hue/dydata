import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLatestSnapshotMap,
  buildTopicRecommendationQueryOptions,
} from "./recommendations";

test("AI 选题建议参数拒绝非法账号 ID", () => {
  assert.deepEqual(buildTopicRecommendationQueryOptions(new URLSearchParams("accountId=not-a-uuid")), {
    ok: false,
    status: 400,
    message: "accountId 格式不正确",
  });
});

test("AI 选题建议对同一视频只使用最新的 24 小时快照", () => {
  const snapshots = buildLatestSnapshotMap([
    { video_id: "video-1", play_count: 5000 },
    { video_id: "video-1", play_count: 1200 },
    { video_id: "video-2", play_count: 800 },
  ]);

  assert.equal(snapshots.get("video-1")?.play_count, 5000);
  assert.equal(snapshots.get("video-2")?.play_count, 800);
});
