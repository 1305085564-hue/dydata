import assert from "node:assert/strict";
import test from "node:test";
import { buildLatestVideoSnapshotMap } from "./video-snapshot-map";

test("按视频保留最新 24h 快照并忽略其他类型", () => {
  const result = buildLatestVideoSnapshotMap([
    { video_id: "v1", snapshot_type: "24h", captured_at: "2026-09-20T01:00:00Z", value: 1 },
    { video_id: "v1", snapshot_type: "24h", captured_at: "2026-09-20T02:00:00Z", value: 2 },
    { video_id: "v1", snapshot_type: "initial", captured_at: "2026-09-20T03:00:00Z", value: 3 },
    { video_id: "v2", snapshot_type: "initial", captured_at: "2026-09-20T03:00:00Z", value: 4 },
  ]);

  assert.deepEqual(result.get("v1"), {
    video_id: "v1",
    snapshot_type: "24h",
    captured_at: "2026-09-20T02:00:00Z",
    value: 2,
  });
  assert.equal(result.has("v2"), false);
});
