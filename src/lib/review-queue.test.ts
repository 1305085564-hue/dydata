import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewQueue,
  getMetricWarningReasons,
  getPriorityScore,
  buildSnapshotMap,
  type VideoRow,
} from "./review-queue";
import type { ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import { DEFAULT_VIDEO_REVIEW_THRESHOLDS } from "./video-review-thresholds";

function makeVideo(partial: Partial<VideoRow> & { id: string }): VideoRow {
  return {
    id: partial.id,
    user_id: "user-1",
    account_id: "acc-1",
    video_url: "https://example.com/video.mp4",
    video_title: partial.video_title ?? "测试视频",
    content: partial.content ?? "文案内容",
    uploaded_at: partial.uploaded_at ?? "2026-08-09T03:00:00Z",
    published_at: partial.published_at ?? "2026-08-09T03:00:00Z",
    anomaly_status: partial.anomaly_status ?? "normal",
    created_at: partial.created_at ?? "2026-08-09T03:00:00Z",
    accounts: partial.accounts ?? { name: "测试账号" },
    profiles: partial.profiles ?? { name: "张三" },
    lifecycle_state: partial.lifecycle_state ?? "active",
    play_change_signal: partial.play_change_signal ?? null,
    play_count_change_pct: partial.play_count_change_pct ?? null,
    previous_play_count: partial.previous_play_count ?? null,
  };
}

function makeSnapshot(partial: Partial<VideoMetricsSnapshot> & { video_id: string }): VideoMetricsSnapshot {
  return {
    id: `snap-${partial.video_id}`,
    video_id: partial.video_id,
    snapshot_type: partial.snapshot_type ?? "24h",
    captured_at: partial.captured_at ?? "2026-08-09T04:00:00Z",
    play_count: partial.play_count ?? 10000,
    bounce_rate_2s: partial.bounce_rate_2s ?? 25,
    completion_rate_5s: partial.completion_rate_5s ?? 40,
    completion_rate: partial.completion_rate ?? 5,
    avg_play_duration: partial.avg_play_duration ?? 20,
    follower_gain: partial.follower_gain ?? 10,
    follower_loss: partial.follower_loss ?? 0,
    fan_play_ratio: partial.fan_play_ratio ?? null,
    homepage_visits: partial.homepage_visits ?? 0,
    follower_convert: partial.follower_convert ?? 0,
    cover_click_rate: partial.cover_click_rate ?? null,
    avg_play_ratio: partial.avg_play_ratio ?? null,
    vs_previous: partial.vs_previous ?? null,
    likes: partial.likes ?? 100,
    comments: partial.comments ?? 10,
    shares: partial.shares ?? 5,
    favorites: partial.favorites ?? 20,
    screenshot_urls: [],
    curve_screenshot_url: null,
    retention_screenshot_url: null,
  };
}

function makeReadiness(
  videoId: string,
  status: ContentReviewReadiness["status"] = "ready",
  hasAnalysis = false,
): ContentReviewReadiness {
  return {
    video_id: videoId,
    status,
    label: status === "ready" ? "可复盘" : "待完善",
    can_generate: true,
    has_snapshot_24h: true,
    has_content: true,
    has_segments: true,
    has_analysis: hasAnalysis,
  };
}

test("buildSnapshotMap 仅保留 24h 快照并取最新一条", () => {
  const snapshots: VideoMetricsSnapshot[] = [
    makeSnapshot({ video_id: "v1", snapshot_type: "24h", captured_at: "2026-08-09T01:00:00Z", play_count: 1000 }),
    makeSnapshot({ video_id: "v1", snapshot_type: "24h", captured_at: "2026-08-09T03:00:00Z", play_count: 5000 }),
    makeSnapshot({ video_id: "v2", snapshot_type: "initial" as unknown as VideoMetricsSnapshot["snapshot_type"], captured_at: "2026-08-09T04:00:00Z" }),
  ];

  const map = buildSnapshotMap(snapshots);
  assert.equal(map.size, 1);
  assert.equal(map.get("v1")?.play_count, 5000);
});

test("getMetricWarningReasons 正确捕获各项低于/高于阈值的异常", () => {
  const normalSnap = makeSnapshot({
    video_id: "v1",
    play_count: 50000,
    bounce_rate_2s: 20,
    completion_rate_5s: 50,
    avg_play_duration: 30,
    completion_rate: 10,
  });
  assert.deepEqual(getMetricWarningReasons(normalSnap, DEFAULT_VIDEO_REVIEW_THRESHOLDS), []);

  const badSnap = makeSnapshot({
    video_id: "v2",
    play_count: 500,
    bounce_rate_2s: 60,
    completion_rate_5s: 15,
    avg_play_duration: 5,
    completion_rate: 1,
  });
  const reasons = getMetricWarningReasons(badSnap, DEFAULT_VIDEO_REVIEW_THRESHOLDS);
  assert.equal(reasons.length, 5);
  assert.match(reasons[0], /播放 500/);
  assert.match(reasons[1], /2s跳出 60\.0%/);
  assert.match(reasons[2], /5s完播 15\.0%/);
  assert.match(reasons[3], /均播 5\.0s/);
  assert.match(reasons[4], /完播 1\.0%/);

  assert.deepEqual(getMetricWarningReasons(undefined, DEFAULT_VIDEO_REVIEW_THRESHOLDS), ["缺少 24h 快照"]);
});

test("getPriorityScore 只根据异常、数据完整度和是否已有分析加权", () => {
  const vDeleted = makeVideo({ id: "v1", anomaly_status: "删稿" });
  const vHalved = makeVideo({ id: "v2", anomaly_status: "normal", play_change_signal: "halve" });
  const vNormal = makeVideo({ id: "v3", anomaly_status: "normal" });

  const unanalyzed = makeReadiness("v1", "ready", false);
  const analyzed = makeReadiness("v1", "analyzed", true);

  const scoreDeleted = getPriorityScore(vDeleted, undefined, unanalyzed);
  const scoreHalved = getPriorityScore(vHalved, undefined, unanalyzed);
  const scoreNormalUnanalyzed = getPriorityScore(vNormal, undefined, unanalyzed);
  const scoreNormalAnalyzed = getPriorityScore(vNormal, undefined, analyzed);

  assert.equal(scoreDeleted > scoreHalved, true);
  assert.equal(scoreHalved > scoreNormalUnanalyzed, true);
  assert.equal(scoreNormalUnanalyzed > scoreNormalAnalyzed, true);
});

test("buildReviewQueue 在 priority、user、latest 模式下产生确定性排序", () => {
  const v1 = makeVideo({
    id: "v1",
    uploaded_at: "2026-08-09T01:00:00Z",
    profiles: { name: "张三" },
    anomaly_status: "删稿",
  });
  const v2 = makeVideo({
    id: "v2",
    uploaded_at: "2026-08-09T05:00:00Z",
    profiles: { name: "李四" },
    anomaly_status: "normal",
    play_change_signal: "halve",
  });
  const v3 = makeVideo({
    id: "v3",
    uploaded_at: "2026-08-09T03:00:00Z",
    profiles: { name: "王五" },
    anomaly_status: "normal",
  });

  const videos = [v3, v1, v2];
  const snapshots: VideoMetricsSnapshot[] = [];
  const reviewReadiness = {
    v1: makeReadiness("v1", "analyzed", true),
    v2: makeReadiness("v2", "missing_snapshot", false),
    v3: makeReadiness("v3", "analyzed", true),
  };

  // 1. 最差优先 (priority)
  const priorityQueue = buildReviewQueue({
    videos,
    snapshots,
    reviewReadiness,
    sortMode: "priority",
  });
  assert.deepEqual(priorityQueue.map((v) => v.id), ["v1", "v2", "v3"]);

  // 2. 按人优先 (user: 拼音/localeCompare)
  const userQueue = buildReviewQueue({
    videos,
    snapshots,
    reviewReadiness,
    sortMode: "user",
  });
  assert.deepEqual(userQueue.map((v) => v.id), ["v2", "v3", "v1"]); // 李四 < 王五 < 张三

  // 3. 按最新时间优先 (latest: 05:00 > 03:00 > 01:00)
  const latestQueue = buildReviewQueue({
    videos,
    snapshots,
    reviewReadiness,
    sortMode: "latest",
  });
  assert.deepEqual(latestQueue.map((v) => v.id), ["v2", "v3", "v1"]);

  const diagnosticQueue = buildReviewQueue({
    videos,
    snapshots,
    reviewReadiness,
    sortMode: "priority",
    filterMode: "queue",
  });
  assert.deepEqual(diagnosticQueue.map((v) => v.id), ["v1", "v2"]);
});
