import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoryReport24hSnapshotPatch,
  isHistorySnapshotSyncFailure,
} from "./history-report-snapshot-sync";

test("手稿指标同步到 24h 快照时保留 null/0 语义，且不携带附属证据字段", () => {
  const patch = buildHistoryReport24hSnapshotPatch({
    play_count: 1200,
    likes: 80,
    comments: 12,
    shares: 3,
    favorites: 20,
    follower_gain: 6,
    follower_convert: null,
    avg_play_duration: 3.2,
    bounce_rate_2s: 41.5,
    completion_rate: 12.8,
    completion_rate_5s: 28,
  });

  assert.deepEqual(patch, {
    play_count: 1200,
    likes: 80,
    comments: 12,
    shares: 3,
    favorites: 20,
    follower_gain: 6,
    follower_convert: null,
    avg_play_duration: 3.2,
    bounce_rate_2s: 41.5,
    completion_rate: 12.8,
    completion_rate_5s: 28,
  });
  assert.equal("follower_loss" in patch, false);
  assert.equal("screenshot_urls" in patch, false);
  assert.equal("vs_previous" in patch, false);
  assert.equal("retention_screenshot_url" in patch, false);
});

test("明确的 0 写入快照为 0，空值写 null，不互相转换", () => {
  const patch = buildHistoryReport24hSnapshotPatch({
    play_count: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    favorites: 0,
    follower_gain: 0,
    follower_convert: 0,
    avg_play_duration: null,
    bounce_rate_2s: null,
    completion_rate: null,
    completion_rate_5s: null,
  });

  assert.equal(patch.play_count, 0);
  assert.equal(patch.follower_convert, 0);
  assert.equal(patch.avg_play_duration, null);
  assert.equal(patch.completion_rate, null);
});

test("无绑定视频或无 24h 快照时不视为同步失败；有库错误才失败", () => {
  assert.equal(isHistorySnapshotSyncFailure(null, { data: [], error: null }), false);
  assert.equal(isHistorySnapshotSyncFailure("video-1", { data: [], error: null }), false);
  assert.equal(
    isHistorySnapshotSyncFailure("video-1", { data: [{ id: "s1" }], error: null }),
    false,
  );
  assert.equal(
    isHistorySnapshotSyncFailure("video-1", { data: null, error: { message: "boom" } }),
    true,
  );
});
