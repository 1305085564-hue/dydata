import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAccountBaseline,
  buildNextDayReviewPrompt,
  buildPeerBaselinePlaceholder,
  formatTimeRange,
  getAnomalyNotice,
  getSampleCredibility,
  parseNextDayReviewResult,
} from "./next-day-review";

test("样本量边界与投流降级按规则返回", () => {
  assert.equal(getSampleCredibility(null).level, "insufficient");
  assert.equal(getSampleCredibility(20_000).level, "partial");
  assert.equal(getSampleCredibility(30_001).level, "full");
  assert.equal(getSampleCredibility(30_001, "投流").level, "partial");
  assert.match(getAnomalyNotice("限流") ?? "", /保守口径/);
});

test("空快照与 0 指标不会被丢弃", () => {
  assert.deepEqual(buildAccountBaseline([]), { sample_count: 0, play_count: null, bounce_rate_2s: null, completion_rate_5s: null, completion_rate: null, avg_play_duration: null });
  assert.equal(buildAccountBaseline([{ play_count: 0, bounce_rate_2s: null, completion_rate_5s: null, completion_rate: null, avg_play_duration: null }]).play_count, 0);
  assert.equal(formatTimeRange(null, 0), "时间未知");
  assert.equal(formatTimeRange(-1, 61.9), "0:00-1:01");
});

test("AI 结果补齐默认字段，非法 JSON 返回 null", () => {
  const parsed = parseNextDayReviewResult('{"summary":{},"actions":{"instructions":[]},"segments":[{"segment_order":0}]}');
  assert.equal(parsed?.actions.instructions.length, 3);
  assert.equal(parsed?.segments[0]?.segment_order, 0);
  assert.equal(parseNextDayReviewResult("bad-json"), null);
  assert.equal(buildPeerBaselinePlaceholder().sample_count, 0);
});

test("提示词在无文案和空切段时仍包含完整约束", () => {
  const prompt = buildNextDayReviewPrompt({ sample_level: "insufficient", play_count: 0, bounce_rate_2s: null, completion_rate_5s: null, completion_rate: null, avg_play_duration: null, follower_gain: null, likes: null, comments: null, shares: null, anomaly_status: null, script_raw_text: null, segments: [], account_baseline: buildAccountBaseline([]), peer_baseline: buildPeerBaselinePlaceholder(), anomaly_notice: null });
  assert.match(prompt, /样本不足/);
  assert.match(prompt, /文案原文：\n（空）/);
  assert.match(prompt, /切段：\n\[\]/);
});
