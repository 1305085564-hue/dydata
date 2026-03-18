import test from "node:test";
import assert from "node:assert/strict";

import {
  breakoutCoefficient,
  fanConversionRate,
  followerConversionRate,
  getAccountBaseline,
  homepageVisitRate,
  interactionRate,
  median,
} from "./video-metrics";
import type { VideoMetricsSnapshot } from "@/types";

function buildSnapshot(overrides: Partial<VideoMetricsSnapshot> = {}): VideoMetricsSnapshot {
  return {
    id: "snapshot-1",
    video_id: "video-1",
    snapshot_type: "24h",
    play_count: 1000,
    likes: 120,
    comments: 30,
    shares: 10,
    favorites: 40,
    follower_gain: 25,
    follower_loss: 5,
    fan_play_ratio: null,
    homepage_visits: 80,
    follower_convert: 20,
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

test("互动率按赞评藏转除以播放计算", () => {
  const result = interactionRate(buildSnapshot());

  assert.equal(result, 0.2);
});

test("播放为 0 时各类比率返回 null", () => {
  const snapshot = buildSnapshot({
    play_count: 0,
    follower_gain: 10,
    follower_convert: 8,
    homepage_visits: 20,
  });

  assert.equal(interactionRate(snapshot), null);
  assert.equal(followerConversionRate(snapshot), null);
  assert.equal(fanConversionRate(snapshot), null);
  assert.equal(homepageVisitRate(snapshot), null);
});

test("粉转率、导粉率、主页访问率按播放计算", () => {
  const snapshot = buildSnapshot({
    play_count: 500,
    follower_gain: 15,
    follower_convert: 25,
    homepage_visits: 100,
  });

  assert.equal(followerConversionRate(snapshot), 0.03);
  assert.equal(fanConversionRate(snapshot), 0.05);
  assert.equal(homepageVisitRate(snapshot), 0.2);
});

test("爆款系数按播放除以基线中位数计算", () => {
  assert.equal(breakoutCoefficient(1200, 300), 4);
});

test("基线为空或 0 时爆款系数返回 null", () => {
  assert.equal(breakoutCoefficient(1200, null), null);
  assert.equal(breakoutCoefficient(1200, 0), null);
});

test("中位数支持奇数和偶数样本", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([9, 1, 5, 7]), 6);
});

test("空数组中位数返回 null", () => {
  assert.equal(median([]), null);
});

test("样本量至少 10 条时账号基线采用自身中位数", () => {
  const result = getAccountBaseline([100, 120, 140, 160, 180, 200, 220, 240, 260, 280], 150);

  assert.deepEqual(result, { median: 190, strategy: "self" });
});

test("样本量 3 到 9 条且有团队中位数时账号基线采用混合策略", () => {
  const result = getAccountBaseline([100, 200, 400], 300);

  assert.deepEqual(result, { median: 250, strategy: "mixed" });
});

test("样本不足或缺少团队中位数时返回 insufficient", () => {
  assert.deepEqual(getAccountBaseline([100, 200], 300), {
    median: null,
    strategy: "insufficient",
  });

  assert.deepEqual(getAccountBaseline([100, 200, 300], null), {
    median: null,
    strategy: "insufficient",
  });
});
