import test from "node:test";
import assert from "node:assert/strict";

import { buildContentFeedbackCopyText } from "./content-feedback-copy";

test("buildContentFeedbackCopyText 用死规则拼出可粘贴文本", () => {
  const text = buildContentFeedbackCopyText({
    title: "半导体还能追吗",
    mainIssue: "开头钩子弱，5s 完播偏低。",
    suggestion: "开头先给结论，再压缩背景铺垫。",
    findings: [
      {
        metric_label: "5s完播",
        tone: "bad",
        value: 22,
        ref_value: 40,
        delta: -18,
        points_to: "开头钩子弱，没给继续看的理由",
      },
      {
        metric_label: "点赞",
        tone: "good",
        value: 6.5,
        ref_value: 5.2,
        delta: 1.3,
        points_to: "观点有认可度",
      },
    ],
  });

  assert.match(text, /^视频复盘建议：半导体还能追吗/);
  assert.match(text, /主要问题：开头钩子弱，5s 完播偏低。/);
  assert.match(text, /1\. 5s完播: 当前 22，参照 40，偏离 -18\.0。指向: 开头钩子弱/);
  assert.doesNotMatch(text, /点赞/);
  assert.match(text, /改进建议：\n开头先给结论/);
});

test("buildContentFeedbackCopyText 没有异常时返回诚实兜底", () => {
  const text = buildContentFeedbackCopyText({
    findings: [],
    mainIssue: "",
    suggestion: "",
  });

  assert.match(text, /未命名视频/);
  assert.match(text, /暂无人工填写的主要问题/);
  assert.match(text, /暂无明显异常指标/);
  assert.match(text, /暂无人工填写的改进建议/);
});

test("异常指标缺少 value、ref_value 与 delta 时明确展示缺数据", () => {
  const text = buildContentFeedbackCopyText({
    findings: [{
      metric_label: "点赞",
      tone: "bad",
      value: null,
      ref_value: null,
      delta: null,
      points_to: "缺少可用快照",
    }],
  });

  assert.match(text, /1\. 点赞: 当前 缺数据。指向: 缺少可用快照/);
  assert.doesNotMatch(text, /参照/);
  assert.doesNotMatch(text, /偏离/);
});

test("异常指标超过五项时只保留前五项", () => {
  const text = buildContentFeedbackCopyText({
    findings: Array.from({ length: 6 }, (_, index) => ({
      metric_label: `指标${index + 1}`,
      tone: "bad" as const,
      value: index + 1,
      ref_value: 0,
      delta: index + 1,
      points_to: "待复盘",
    })),
  });

  assert.match(text, /5\. 指标5/);
  assert.doesNotMatch(text, /指标6/);
});

test("多参照归因复制文本保留每条证据的参照来源", () => {
  const text = buildContentFeedbackCopyText({
    findings: [{
      metric_label: "完播率",
      tone: "warn",
      value: 35,
      ref_value: 48,
      delta: -13,
      ref_label: "对比团队均值",
      points_to: "团队口径下表现偏低",
    }],
  });

  assert.match(text, /对比团队均值 48/);
});

test("仅 good 指标时沿用无异常兜底", () => {
  const text = buildContentFeedbackCopyText({
    findings: [{
      metric_label: "完播率",
      tone: "good",
      value: 50,
      ref_value: 40,
      delta: 10,
      points_to: "表现良好",
    }],
  });

  assert.match(text, /暂无明显异常指标/);
  assert.doesNotMatch(text, /完播率/);
});
