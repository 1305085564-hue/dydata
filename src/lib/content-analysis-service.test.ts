import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentAnalysisPrompt,
  buildSnapshotBaseline,
  normalizeContentAnalysisResult,
  parseContentAnalysisResult,
} from "./content-analysis-service";

test("normalizeContentAnalysisResult 只保留允许的疑似阶段并补默认字段", () => {
  const result = normalizeContentAnalysisResult({
    data_summary: "播放暴涨但互动没有同步。",
    suspected_stage: ["opening", "platform_weight", "weak_conversion"],
    key_metric_evidence: "播放+186%；评论未增长",
    copywriting_reason: "",
    abnormal_points: ["播放和互动分化"],
    reusable_experience: "开头结论前置有效。",
    feedback_draft: {
      main_issues: "互动承接弱",
      improvement_feedback: "下条结尾补明确评论引导。",
    },
  });

  assert.deepEqual(result?.suspected_stage, ["opening", "weak_conversion"]);
  assert.deepEqual(result?.key_metric_evidence, ["播放+186%", "评论未增长"]);
  assert.equal(result?.copywriting_reason, "暂未形成明确文案归因。");
  assert.equal(result?.feedback_draft.main_issues, "互动承接弱");
});

test("parseContentAnalysisResult 拒绝非 JSON 内容", () => {
  assert.equal(parseContentAnalysisResult("不是 JSON"), null);
  assert.equal(parseContentAnalysisResult(JSON.stringify({ data_summary: "正常齐涨齐跌" }))?.data_summary, "正常齐涨齐跌");
});

test("buildSnapshotBaseline 计算 30 天账号均值", () => {
  const baseline = buildSnapshotBaseline([
    {
      play_count: 100,
      bounce_rate_2s: 40,
      completion_rate_5s: 30,
      completion_rate: 20,
      avg_play_duration: 8,
      likes: 10,
      comments: 2,
      shares: 1,
      favorites: 4,
      follower_gain: 3,
    },
    {
      play_count: 300,
      bounce_rate_2s: null,
      completion_rate_5s: 50,
      completion_rate: 30,
      avg_play_duration: 12,
      likes: 30,
      comments: 4,
      shares: 3,
      favorites: 8,
      follower_gain: 5,
    },
  ]);

  assert.equal(baseline.sample_count, 2);
  assert.equal(baseline.play_count, 200);
  assert.equal(baseline.bounce_rate_2s, 40);
  assert.equal(baseline.completion_rate_5s, 40);
});

test("buildContentAnalysisPrompt 明确内部分析边界和输出结构", () => {
  const prompt = buildContentAnalysisPrompt({ video_id: "video-1" });

  assert.match(prompt, /内部分析助手/);
  assert.match(prompt, /只输出 JSON/);
  assert.match(prompt, /feedback_draft/);
  assert.match(prompt, /不要替管理者做最终结论/);
  assert.match(prompt, /禁止输出平台权重/);
});
