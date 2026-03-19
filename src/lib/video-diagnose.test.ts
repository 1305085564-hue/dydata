import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVideoDiagnosePrompt,
  calculateAccountBaselineMedian,
  findMarketContextForPublishedAt,
  type VideoDiagnoseInput,
  type VideoHistorySample,
} from "./video-diagnose";
import type { MarketContextDaily, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    account_id: "account-1",
    user_id: "user-1",
    video_url: null,
    video_title: "早盘复盘：指数回踩后怎么看",
    content: "先讲结论，再拆板块，最后引导看主页",
    published_at: "2026-03-18T09:30:00.000Z",
    uploaded_at: "2026-03-18T10:00:00.000Z",
    anomaly_status: "正常",
    created_at: "2026-03-18T10:00:00.000Z",
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<VideoMetricsSnapshot> = {}): VideoMetricsSnapshot {
  return {
    id: "snapshot-1",
    video_id: "video-1",
    snapshot_type: "24h",
    play_count: 15000,
    likes: 820,
    comments: 120,
    shares: 60,
    favorites: 310,
    follower_gain: 95,
    follower_loss: 12,
    fan_play_ratio: 0.18,
    homepage_visits: 450,
    follower_convert: 66,
    cover_click_rate: 0.42,
    avg_play_duration: 38,
    completion_rate: 0.31,
    bounce_rate_2s: 0.47,
    completion_rate_5s: 0.56,
    avg_play_ratio: 0.41,
    vs_previous: null,
    screenshot_urls: ["https://example.com/data.png"],
    curve_screenshot_url: "https://example.com/curve.png",
    retention_screenshot_url: "https://example.com/retention.png",
    captured_at: "2026-03-19T12:00:00.000Z",
    ...overrides,
  };
}

function buildTag(overrides: Partial<VideoTag> = {}): VideoTag {
  return {
    id: "tag-1",
    video_id: "video-1",
    tag_dimension: "题材",
    tag_value: "大盘复盘",
    source: "manual",
    confidence: 0.9,
    reason: "人工确认",
    reviewed_by: "user-1",
    created_at: "2026-03-19T12:00:00.000Z",
    ...overrides,
  };
}

function buildMarketContext(overrides: Partial<MarketContextDaily> = {}): MarketContextDaily {
  return {
    id: "market-1",
    context_date: "2026-03-18",
    is_trading_day: true,
    market_change: { 上证: -0.8, 创业板: -1.5 },
    market_sentiment: "弱",
    hot_sectors: ["机器人", "算力"],
    source: "manual",
    updated_by: null,
    created_at: "2026-03-18T20:00:00.000Z",
    ...overrides,
  };
}

test("近30条播放取中位数并忽略更早样本", () => {
  const samples: VideoHistorySample[] = Array.from({ length: 32 }, (_, index) => ({
    video_id: `video-${index + 1}`,
    published_at: new Date(Date.UTC(2026, 1, index + 1, 9, 0, 0)).toISOString(),
    play_count_24h: index + 1,
  }));

  const result = calculateAccountBaselineMedian(samples);

  assert.equal(result, 17.5);
});

test("基线计算会过滤空值和非正数，样本不足时返回 null", () => {
  const result = calculateAccountBaselineMedian([
    { video_id: "video-1", published_at: "2026-03-01T09:00:00.000Z", play_count_24h: null },
    { video_id: "video-2", published_at: "2026-03-02T09:00:00.000Z", play_count_24h: 0 },
    { video_id: "video-3", published_at: "2026-03-03T09:00:00.000Z", play_count_24h: -10 },
  ]);

  assert.equal(result, null);
});

test("按 published_at 匹配同日市场环境", () => {
  const contexts = [
    buildMarketContext({ id: "market-0", context_date: "2026-03-17", market_sentiment: "中" }),
    buildMarketContext({ id: "market-1", context_date: "2026-03-18", market_sentiment: "弱" }),
  ];

  const result = findMarketContextForPublishedAt("2026-03-18T09:30:00.000Z", contexts);

  assert.deepEqual(result, contexts[1]);
});

test("没有发布时间或没有同日市场数据时返回 null", () => {
  const contexts = [buildMarketContext()];

  assert.equal(findMarketContextForPublishedAt(null, contexts), null);
  assert.equal(findMarketContextForPublishedAt("2026-03-19T09:30:00.000Z", contexts), null);
});

test("构建诊断 prompt 时包含五步输出要求、核心输入和基线信息", () => {
  const input: VideoDiagnoseInput = {
    video: buildVideo(),
    snapshot24h: buildSnapshot(),
    tags: [
      buildTag({ tag_dimension: "题材", tag_value: "大盘复盘" }),
      buildTag({ id: "tag-2", tag_dimension: "表达形式", tag_value: "结论先行" }),
      buildTag({ id: "tag-3", tag_dimension: "CTA类型", tag_value: "看主页" }),
    ],
    curvePattern: {
      pattern: "前高后低",
      firstPeakPosition: "发布后 1 小时",
      dropSeverity: "high",
      tailStrength: "low",
      confidence: 0.88,
    },
    bounceAnalysis: {
      bouncePeakTime: "0-2秒",
      replayPeakTime: "18-22秒",
      segmentSummary: [
        { segment: "0-3秒", performance: "跳出明显" },
        { segment: "15-25秒", performance: "存在回看" },
      ],
    },
    marketContext: buildMarketContext(),
    accountBaselineMedian: 12000,
    sameAccountHistory: [
      { video_id: "old-1", published_at: "2026-03-10T09:00:00.000Z", play_count_24h: 8000 },
      { video_id: "old-2", published_at: "2026-03-11T09:00:00.000Z", play_count_24h: 12000 },
      { video_id: "old-3", published_at: "2026-03-12T09:00:00.000Z", play_count_24h: 16000 },
    ],
  };

  const prompt = buildVideoDiagnosePrompt(input);

  assert.match(prompt, /主因判断[\s\S]*问题段落[\s\S]*证据[\s\S]*改法[\s\S]*置信度/);
  assert.match(prompt, /早盘复盘：指数回踩后怎么看/);
  assert.match(prompt, /播放.*15000/);
  assert.match(prompt, /账号近30条24h播放中位数.*12000/);
  assert.match(prompt, /市场情绪.*弱/);
  assert.match(prompt, /前高后低/);
  assert.match(prompt, /0-2秒/);
  assert.match(prompt, /结论先行/);
  assert.match(prompt, /请严格输出 JSON/);
});

test("缺少可选输入时 prompt 仍提供明确兜底信息", () => {
  const prompt = buildVideoDiagnosePrompt({
    video: buildVideo({ published_at: null, video_title: null, content: null }),
    snapshot24h: buildSnapshot({ play_count: 9000 }),
    tags: [],
    curvePattern: null,
    bounceAnalysis: null,
    marketContext: null,
    accountBaselineMedian: null,
    sameAccountHistory: [],
  });

  assert.match(prompt, /标题：无/);
  assert.match(prompt, /标签：无/);
  assert.match(prompt, /曲线模式：无/);
  assert.match(prompt, /跳出分析：无/);
  assert.match(prompt, /市场环境：无/);
  assert.match(prompt, /同账号历史：无/);
});
