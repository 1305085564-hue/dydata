import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSingleVideoPrompt,
  normalizeSingleVideoInsight,
  resolveSingleVideoConfidence,
  type SingleVideoAiResult,
} from "./insight-single-video";

const sampleInput = {
  metrics: {
    play_count: 3200,
    follower_gain: 21,
    lead_count: 5,
    like_count: 180,
    comment_count: 28,
    share_count: 16,
    favorite_count: 34,
    avg_watch_sec: 19.4,
    bounce_2s_rate: 0.58,
    completion_5s_rate: 0.41,
    full_completion_rate: 0.12,
  },
  baseline: {
    play_count: 5100,
    follower_gain: 18,
    lead_count: 4,
    like_count: 150,
    comment_count: 20,
    share_count: 10,
    favorite_count: 25,
    avg_watch_sec: 17.8,
    bounce_2s_rate: 0.49,
    completion_5s_rate: 0.46,
    full_completion_rate: 0.11,
  },
  traffic_curve_features: {
    drop_points: [{ second: 3, drop_rate: 0.58 }],
    curve_pattern: "前高后低",
  },
  script_segments: [
    { type: "hook", content: "先铺背景才说结论", start_sec: 0, end_sec: 6 },
  ],
  tags: [
    { dimension: "topic", tag_code: "hot_event", tag_name: "热点事件定性" },
  ],
};

test("buildSingleVideoPrompt 固定输出 JSON 结构与强制规则", () => {
  const prompt = buildSingleVideoPrompt(sampleInput);

  assert.match(prompt, /你是A股超短线财经视频复盘分析师/);
  assert.match(prompt, /严格按JSON格式输出/);
  assert.match(prompt, /play_count<500时confidence=low/);
  assert.match(prompt, /禁止输出"建议提高内容质量"等废话/);
  assert.match(prompt, /drop_points/);
  assert.match(prompt, /先铺背景才说结论/);
});

test("normalizeSingleVideoInsight 保留合法字段并把证据转为数组", () => {
  const normalized = normalizeSingleVideoInsight({
    verdict: "播放3200但2秒跳出58%",
    key_problem: {
      time_range: "0-3秒",
      drop_rate: 58,
      script_fragment: "先铺背景才说结论",
      diagnosis: "开头3秒信息密度不足",
    },
    suggestions: [
      {
        target: "hook",
        problem: "前3秒跳出58%",
        action: "前2秒先抛结论+收益数字",
        example: "今天最强主线不是机器人，是半导体回流",
      },
      {
        target: "other",
        problem: "无效",
        action: "无效",
      },
    ],
    confidence: "medium",
    evidence: "播放3200；2秒跳出58%；5秒完播41%",
  });

  assert.deepEqual(normalized as SingleVideoAiResult, {
    verdict: "播放3200但2秒跳出58%",
    key_problem: {
      time_range: "0-3秒",
      drop_rate: 58,
      script_fragment: "先铺背景才说结论",
      diagnosis: "开头3秒信息密度不足",
    },
    suggestions: [
      {
        target: "hook",
        problem: "前3秒跳出58%",
        action: "前2秒先抛结论+收益数字",
        example: "今天最强主线不是机器人，是半导体回流",
      },
    ],
    confidence: "medium",
    evidence: ["播放3200", "2秒跳出58%", "5秒完播41%"],
  });
});

test("resolveSingleVideoConfidence 在低播放量时强制降为 low 并补样本量不足", () => {
  const normalized = resolveSingleVideoConfidence(
    {
      verdict: "前3秒跳出58%",
      key_problem: {
        time_range: null,
        drop_rate: 58,
        script_fragment: null,
        diagnosis: "样本少但前段流失明显",
      },
      suggestions: [
        {
          target: "hook",
          problem: "前3秒跳出58%",
          action: "开头2秒先给收益数字",
        },
      ],
      confidence: "high",
      evidence: ["播放320"],
    },
    320
  );

  assert.equal(normalized.confidence, "low");
  assert.match(normalized.verdict, /样本量不足/);
});
