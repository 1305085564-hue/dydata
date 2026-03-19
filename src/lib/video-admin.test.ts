import test from "node:test";
import assert from "node:assert/strict";

import {
  build24hSnapshotPayload,
  shouldShowPatch24hButton,
  type Patch24hMetricsInput,
} from "./video-admin";
import type { Video, VideoMetricsSnapshot } from "@/types";

function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    video_url: null,
    video_title: "测试视频",
    content: null,
    published_at: "2026-03-18T12:00:00.000Z",
    uploaded_at: "2026-03-18T12:00:00.000Z",
    anomaly_status: "正常",
    created_at: "2026-03-18T12:00:00.000Z",
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<VideoMetricsSnapshot> = {}): VideoMetricsSnapshot {
  return {
    id: "snapshot-1",
    video_id: "video-1",
    snapshot_type: "24h",
    play_count: 1000,
    likes: 100,
    comments: 20,
    shares: 10,
    favorites: 30,
    follower_gain: 12,
    follower_loss: 0,
    fan_play_ratio: null,
    homepage_visits: 0,
    follower_convert: 0,
    cover_click_rate: null,
    avg_play_duration: null,
    completion_rate: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    avg_play_ratio: null,
    vs_previous: null,
    screenshot_urls: null,
    curve_screenshot_url: null,
    retention_screenshot_url: null,
    captured_at: "2026-03-19T12:00:00.000Z",
    ...overrides,
  };
}

test("未满24h状态且没有24h快照时显示补录按钮", () => {
  const result = shouldShowPatch24hButton(buildVideo({ anomaly_status: "未满24h" }), null);

  assert.equal(result, true);
});

test("正常状态但缺少24h快照时也显示补录按钮", () => {
  const result = shouldShowPatch24hButton(buildVideo({ anomaly_status: "正常" }), null);

  assert.equal(result, true);
});

test("已有24h快照且状态正常时不显示补录按钮", () => {
  const result = shouldShowPatch24hButton(buildVideo({ anomaly_status: "正常" }), buildSnapshot());

  assert.equal(result, false);
});

test("构造24h快照写入数据时保留截图地址并补齐默认字段", () => {
  const metrics: Patch24hMetricsInput = {
    play_count: 3210,
    likes: 210,
    comments: 45,
    shares: 12,
    favorites: 33,
    follower_gain: 18,
    follower_loss: 2,
    follower_convert: 7,
  };

  const result = build24hSnapshotPayload("video-9", metrics, "https://example.com/24h.png");

  assert.deepEqual(result, {
    video_id: "video-9",
    snapshot_type: "24h",
    play_count: 3210,
    likes: 210,
    comments: 45,
    shares: 12,
    favorites: 33,
    follower_gain: 18,
    follower_loss: 2,
    follower_convert: 7,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: null,
    completion_rate: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    avg_play_ratio: null,
    vs_previous: null,
    screenshot_urls: ["https://example.com/24h.png"],
    curve_screenshot_url: null,
    retention_screenshot_url: null,
  });
});
