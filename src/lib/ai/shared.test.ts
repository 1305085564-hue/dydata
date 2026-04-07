import test from "node:test";
import assert from "node:assert/strict";

import {
  extractJsonString,
  normalizeMessageContent,
  renderSingleVideoInsight,
  renderPeriodInsight,
  toAiErrorMessage,
} from "./shared";
import { buildUpstreamUrl } from "./client";

test("buildUpstreamUrl 去掉尾部斜杠并补全 chat/completions", () => {
  assert.equal(buildUpstreamUrl("https://ai.example.com/"), "https://ai.example.com/chat/completions");
  assert.equal(buildUpstreamUrl("https://ai.example.com/base"), "https://ai.example.com/base/chat/completions");
});

test("normalizeMessageContent 兼容字符串与 text block 数组", () => {
  assert.equal(normalizeMessageContent("  {\"ok\":true}  "), '{"ok":true}');
  assert.equal(
    normalizeMessageContent([
      { type: "text", text: "第一行" },
      { type: "input_text", text: "会被忽略" },
      { type: "text", text: "第二行" },
    ]),
    "第一行\n第二行"
  );
});

test("extractJsonString 支持 fenced json 与裸对象", () => {
  assert.equal(extractJsonString('```json\n{"foo":1}\n```'), '{"foo":1}');
  assert.equal(extractJsonString('前缀 {"bar":2} 后缀'), '{"bar":2}');
  assert.equal(extractJsonString("无 JSON"), null);
});

test("renderSingleVideoInsight 把结构化结果压成可读文本", () => {
  const text = renderSingleVideoInsight({
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

  assert.match(text, /播放3200但2秒跳出58%/);
  assert.match(text, /0-3秒/);
  assert.match(text, /前3秒跳出58%/);
  assert.match(text, /今天最强主线不是机器人/);
});

test("renderPeriodInsight 输出重点方向与样本提醒", () => {
  const text = renderPeriodInsight({
    best_direction: {
      tag: "hook_style:pain_point",
      evidence: "样本12条，爆款率33%，完播率中位数29%",
      recommendation: "下周至少做3条痛点前置开头",
    },
    worst_direction: {
      tag: "cta:no_cta",
      evidence: "样本11条，涨粉率中位数0.4%",
      recommendation: "每条都补明确 CTA",
    },
    validated_experiments: ["痛点前置样本12条中4条进爆款"],
    next_period_focus: "集中测试 pain_point × checklist",
    sample_warning: ["topic:pre_market 样本仅6条"],
  });

  assert.match(text, /hook_style:pain_point/);
  assert.match(text, /cta:no_cta/);
  assert.match(text, /样本仅6条/);
});

test("toAiErrorMessage 统一异常文本", () => {
  assert.equal(toAiErrorMessage(new Error("AI 超时")), "AI 超时");
  assert.equal(toAiErrorMessage("失败"), "失败");
  assert.equal(toAiErrorMessage(null), "未知错误");
});
