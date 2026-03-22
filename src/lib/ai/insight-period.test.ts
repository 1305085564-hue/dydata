import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregatePeriodTagMetrics,
  buildPeriodPrompt,
  normalizePeriodInsight,
} from "./insight-period";

test("aggregatePeriodTagMetrics 按 tag_code 聚合并标记低样本", () => {
  const result = aggregatePeriodTagMetrics([
    {
      tag_code: "pain_point",
      tag_name: "痛点前置",
      dimension: "hook_style",
      play_count: 10000,
      follower_gain: 100,
      full_completion_rate: 0.3,
      is_hit: true,
    },
    {
      tag_code: "pain_point",
      tag_name: "痛点前置",
      dimension: "hook_style",
      play_count: 8000,
      follower_gain: 40,
      full_completion_rate: 0.25,
      is_hit: false,
    },
    {
      tag_code: "no_cta",
      tag_name: "无明显CTA",
      dimension: "cta",
      play_count: 3000,
      follower_gain: 8,
      full_completion_rate: 0.1,
      is_hit: false,
    },
  ], 2);

  assert.deepEqual(result.groups, [
    {
      tag_code: "pain_point",
      tag_name: "痛点前置",
      dimension: "hook_style",
      sample_size: 2,
      hit_rate: 0.5,
      follower_gain_rate_median: 0.0075,
      full_completion_rate_median: 0.275,
    },
  ]);
  assert.deepEqual(result.sample_warning, ["cta:no_cta 样本仅1条"]);
});

test("buildPeriodPrompt 固定 JSON 输出结构与样本规则", () => {
  const prompt = buildPeriodPrompt({
    period_type: "week",
    scope_entity_id: "account-1",
    groups: [
      {
        tag_code: "pain_point",
        tag_name: "痛点前置",
        dimension: "hook_style",
        sample_size: 12,
        hit_rate: 0.33,
        follower_gain_rate_median: 0.018,
        full_completion_rate_median: 0.29,
      },
    ],
    sample_warning: ["topic:pre_market 样本仅6条"],
  });

  assert.match(prompt, /你是内容策略分析师/);
  assert.match(prompt, /基于以下week数据/);
  assert.match(prompt, /样本<10条的维度不输出结论/);
  assert.match(prompt, /继续保持优质内容/);
  assert.match(prompt, /pain_point/);
});

test("normalizePeriodInsight 过滤空结论并保留样本提醒", () => {
  const result = normalizePeriodInsight({
    best_direction: {
      tag: "hook_style:pain_point",
      evidence: "样本12条，爆款率33%",
      recommendation: "下周至少做3条痛点前置开头",
    },
    worst_direction: {
      tag: "cta:no_cta",
      evidence: "样本11条，涨粉率中位数0.4%",
      recommendation: "每条都补 CTA",
    },
    validated_experiments: ["痛点前置样本12条中4条进爆款", "  "],
    next_period_focus: "集中测试 pain_point × checklist",
    sample_warning: "topic:pre_market 样本仅6条；cta:vip_hint 样本仅4条",
  });

  assert.deepEqual(result, {
    best_direction: {
      tag: "hook_style:pain_point",
      evidence: "样本12条，爆款率33%",
      recommendation: "下周至少做3条痛点前置开头",
    },
    worst_direction: {
      tag: "cta:no_cta",
      evidence: "样本11条，涨粉率中位数0.4%",
      recommendation: "每条都补 CTA",
    },
    validated_experiments: ["痛点前置样本12条中4条进爆款"],
    next_period_focus: "集中测试 pain_point × checklist",
    sample_warning: ["topic:pre_market 样本仅6条", "cta:vip_hint 样本仅4条"],
  });
});
