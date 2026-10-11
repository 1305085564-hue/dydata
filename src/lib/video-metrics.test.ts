import test from "node:test";
import assert from "node:assert/strict";

import {
  breakoutCoefficient,
  fanConversionRate,
  favoriteRate,
  followerConversionRate,
  getAccountBaseline,
  interactionRate,
  likeRate,
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

test("点赞率、收藏率按播放计算", () => {
  const snapshot = buildSnapshot();

  assert.equal(likeRate(snapshot), 0.12);
  assert.equal(favoriteRate(snapshot), 0.04);
});

test("播放为 0 时各类比率返回 null", () => {
  const snapshot = buildSnapshot({
    play_count: 0,
    follower_gain: 10,
    follower_convert: 8,
  });

  assert.equal(interactionRate(snapshot), null);
  assert.equal(followerConversionRate(snapshot), null);
  assert.equal(fanConversionRate(snapshot), null);
  assert.equal(likeRate(snapshot), null);
  assert.equal(favoriteRate(snapshot), null);
});

test("转粉率、导粉率按播放计算", () => {
  const snapshot = buildSnapshot({
    play_count: 500,
    follower_gain: 15,
    follower_convert: 25,
  });

  assert.equal(followerConversionRate(snapshot), 0.03);
  assert.equal(fanConversionRate(snapshot), 0.05);
});

test("指标未采集(null)时比率返回 null，不把缺失当成 0", () => {
  const snapshot = buildSnapshot({
    play_count: 500,
    likes: null,
    comments: null,
    shares: null,
    favorites: null,
    follower_gain: null,
    follower_convert: null,
  });

  assert.equal(interactionRate(snapshot), null);
  assert.equal(followerConversionRate(snapshot), null);
  assert.equal(fanConversionRate(snapshot), null);
  assert.equal(likeRate(snapshot), null);
  assert.equal(favoriteRate(snapshot), null);
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

test("脏数据：互动数超过播放量时各项比率被判为无效（返回 null，不产出天文数字）", () => {
  // 复现 2026-10-11 审计实证用例：播放量 2 的作品，详情却显示互动率 31250%
  const snapshot = buildSnapshot({
    play_count: 2,
    likes: 625,
    comments: 0,
    shares: 0,
    favorites: 0,
    follower_gain: 109,
  });

  assert.equal(interactionRate(snapshot), null);
  assert.equal(likeRate(snapshot), null);
  assert.equal(followerConversionRate(snapshot), null);
  // 收藏数为 0 是真实采集到的值（不是脏数据），照常算 0
  assert.equal(favoriteRate(snapshot), 0);
});

test("脏数据：单项超过播放量即整体判无效（互动率是四项之和，不能只看总和）", () => {
  // 互动率四项之和 ≤ 播放，但点赞单独就超过播放 → 仍是脏数据
  const snapshot = buildSnapshot({
    play_count: 100,
    likes: 400,
    comments: 10,
    shares: 10,
    favorites: 10,
  });

  assert.equal(likeRate(snapshot), null);
  assert.equal(interactionRate(snapshot), null);
});

test("正常区间不受影响：比率恰为 100% 仍算有效", () => {
  // 边界：互动数之和 == 播放量，是物理可能的最大值，不该被误判为脏数据
  const snapshot = buildSnapshot({
    play_count: 100,
    likes: 60,
    comments: 20,
    shares: 10,
    favorites: 10,
  });

  assert.equal(interactionRate(snapshot), 1);
  assert.equal(likeRate(snapshot), 0.6);
});

test("高播放作品不受影响：真实爆款比率照常计算", () => {
  const snapshot = buildSnapshot({
    play_count: 50000,
    likes: 3000,
    comments: 400,
    shares: 200,
    favorites: 900,
    follower_gain: 700,
  });

  assert.ok(Math.abs((interactionRate(snapshot) ?? 0) - 0.09) < 1e-9);
  assert.ok(Math.abs((followerConversionRate(snapshot) ?? 0) - 0.014) < 1e-9);
});
