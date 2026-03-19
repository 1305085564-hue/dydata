import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDiagnosisPrompt,
  createBatchSummary,
  createDiagnosisRecord,
  normalizeBatchPayload,
} from "./route";

test("normalizeBatchPayload 限制默认天数和上限 20 条", () => {
  const result = normalizeBatchPayload({ user_id: "u1" });

  assert.equal(result.userId, "u1");
  assert.equal(result.accountId, null);
  assert.equal(result.days, 7);
  assert.equal(result.limit, 20);
});

test("normalizeBatchPayload 允许自定义 account_id 和较小 limit", () => {
  const result = normalizeBatchPayload({ account_id: "a1", days: 3, limit: 5 });

  assert.equal(result.userId, null);
  assert.equal(result.accountId, "a1");
  assert.equal(result.days, 3);
  assert.equal(result.limit, 5);
});

test("buildDiagnosisPrompt 聚合视频、市场、基线信息", () => {
  const prompt = buildDiagnosisPrompt({
    video: {
      id: "v1",
      content: "7秒讲透半导体反弹逻辑",
      tags: [
        { tag_dimension: "topic", tag_value: "半导体" },
        { tag_dimension: "expression", tag_value: "口播" },
      ],
      curve_pattern: "二次起量",
      retention_analysis: {
        bounce_peak_time: "0-3秒",
        replay_peak_time: "12-15秒",
        segment_summary: [{ segment: "10-15秒", performance: "回看明显" }],
      },
      snapshot: {
        play_count: 82000,
        likes: 2600,
        comments: 190,
        shares: 320,
        favorites: 410,
        follower_gain: 88,
      },
      published_at: "2026-03-18T10:00:00.000Z",
      account_name: "主号A",
    },
    marketContext: {
      context_date: "2026-03-18",
      market_sentiment: "hot",
      hot_sectors: ["半导体", "机器人"],
      market_change: { cyb: 1.8 },
    },
    baseline: {
      totalVideos: 6,
      avgPlayCount: 42000,
      avgLikeRate: 0.025,
      bestPlayCount: 120000,
    },
  });

  assert.match(prompt, /7秒讲透半导体反弹逻辑/);
  assert.match(prompt, /二次起量/);
  assert.match(prompt, /0-3秒/);
  assert.match(prompt, /半导体/);
  assert.match(prompt, /平均播放.*42000/);
});

test("createDiagnosisRecord 组装 advice_actions 写入内容", () => {
  const record = createDiagnosisRecord({
    userId: "u1",
    accountId: "a1",
    videoId: "v1",
    diagnosis: {
      summary: "开头信息密度够，但转场拖慢节奏。",
      reasons: ["前3秒承接弱", "中段回看点明显"],
      actions: ["开头先抛结论", "12秒前加结果画面"],
    },
    evidence: "播放8.2万，点赞率3.1%",
  });

  assert.equal(record.target_user_id, "u1");
  assert.equal(record.target_account_id, "a1");
  assert.equal(record.executed_video_id, "v1");
  assert.equal(record.advice_source, "ai");
  assert.equal(record.status, "待查看");
  assert.match(record.advice_content, /开头信息密度够/);
  assert.match(record.advice_content, /开头先抛结论/);
  assert.equal(record.evidence, "播放8.2万，点赞率3.1%");
});

test("createBatchSummary 统计 diagnosed 和 failed", () => {
  const summary = createBatchSummary([
    { ok: true, videoId: "v1" },
    { ok: false, videoId: "v2", error: "AI 超时" },
    { ok: true, videoId: "v3" },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    diagnosed: 2,
    failed: [
      { video_id: "v2", error: "AI 超时" },
    ],
  });
});
