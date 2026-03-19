import test from "node:test";
import assert from "node:assert/strict";

import {
  VIDEO_TAG_REVIEW_DIMENSIONS,
  buildTagFilterState,
  createEmptyVideoTagSelection,
  getTagReviewStatus,
  isVideoMatchedByTagFilters,
  normalizeAiTagSuggestions,
  type RawAiTagSuggestion,
} from "./video-tags";
import type { VideoTag } from "@/types";

test("标签确认维度固定为题材、表达形式、CTA类型", () => {
  assert.deepEqual(VIDEO_TAG_REVIEW_DIMENSIONS, ["题材", "表达形式", "CTA类型"]);
});

test("AI 标签建议只保留合法维度与合法枚举值", () => {
  const suggestions: RawAiTagSuggestion[] = [
    { tag_dimension: "题材", tag_value: "大盘复盘", confidence: 0.92, reason: "明确提到指数复盘" },
    { tag_dimension: "表达形式", tag_value: "问答式", confidence: 0.81, reason: "以提问展开" },
    { tag_dimension: "CTA类型", tag_value: "无明显CTA", confidence: 0.66, reason: "没有引导动作" },
    { tag_dimension: "目标受众", tag_value: "新手股民", confidence: 0.88, reason: "不在本次维度内" },
    { tag_dimension: "题材", tag_value: "自由发挥", confidence: 0.9, reason: "非法枚举" },
  ];

  const result = normalizeAiTagSuggestions(suggestions);

  assert.deepEqual(result, [
    { tag_dimension: "题材", tag_value: "大盘复盘", confidence: 0.92, reason: "明确提到指数复盘" },
    { tag_dimension: "表达形式", tag_value: "问答式", confidence: 0.81, reason: "以提问展开" },
    { tag_dimension: "CTA类型", tag_value: "无明显CTA", confidence: 0.66, reason: "没有引导动作" },
  ]);
});

test("AI 标签建议按维度去重并保留首个合法结果", () => {
  const suggestions: RawAiTagSuggestion[] = [
    { tag_dimension: "题材", tag_value: "板块机会", confidence: 0.9, reason: "先出现的结果" },
    { tag_dimension: "题材", tag_value: "个股拆解", confidence: 0.95, reason: "重复维度应被忽略" },
  ];

  const result = normalizeAiTagSuggestions(suggestions);

  assert.deepEqual(result, [
    { tag_dimension: "题材", tag_value: "板块机会", confidence: 0.9, reason: "先出现的结果" },
  ]);
});

test("低置信度与空置信度都标记为待确认", () => {
  assert.equal(getTagReviewStatus(0.69), "待确认");
  assert.equal(getTagReviewStatus(null), "待确认");
  assert.equal(getTagReviewStatus(0.7), "可信");
});

test("创建空选择状态时每个维度默认空值", () => {
  assert.deepEqual(createEmptyVideoTagSelection(), {
    题材: "",
    表达形式: "",
    CTA类型: "",
  });
});

test("根据标签列表构建确认表单默认值", () => {
  const tags: VideoTag[] = [
    {
      id: "tag-1",
      video_id: "video-1",
      tag_dimension: "题材",
      tag_value: "热点追踪",
      source: "ai",
      confidence: 0.72,
      reason: "围绕热点展开",
      reviewed_by: null,
      created_at: "2026-03-19T00:00:00.000Z",
    },
    {
      id: "tag-2",
      video_id: "video-1",
      tag_dimension: "CTA类型",
      tag_value: "关注",
      source: "ai",
      confidence: 0.61,
      reason: "结尾引导关注",
      reviewed_by: null,
      created_at: "2026-03-19T00:00:00.000Z",
    },
  ];

  assert.deepEqual(buildTagFilterState(tags), {
    题材: "热点追踪",
    表达形式: "",
    CTA类型: "关注",
  });
});

test("标签筛选在同维度内按或、不同维度间按且", () => {
  const tags: VideoTag[] = [
    {
      id: "tag-1",
      video_id: "video-1",
      tag_dimension: "题材",
      tag_value: "热点追踪",
      source: "ai",
      confidence: 0.72,
      reason: null,
      reviewed_by: null,
      created_at: "2026-03-19T00:00:00.000Z",
    },
    {
      id: "tag-2",
      video_id: "video-1",
      tag_dimension: "CTA类型",
      tag_value: "关注",
      source: "manual",
      confidence: 0.4,
      reason: null,
      reviewed_by: "admin-1",
      created_at: "2026-03-19T00:00:00.000Z",
    },
  ];

  const matched = isVideoMatchedByTagFilters(tags, {
    topicTags: ["热点追踪", "盘前预判"],
    formatTags: [],
    ctaTags: ["关注"],
  });

  const notMatched = isVideoMatchedByTagFilters(tags, {
    topicTags: ["板块机会"],
    formatTags: [],
    ctaTags: ["关注"],
  });

  assert.equal(matched, true);
  assert.equal(notMatched, false);
});
