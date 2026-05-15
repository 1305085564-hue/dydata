import test from "node:test";
import assert from "node:assert/strict";

import { buildManualTagPayload, dedupeTagPayloads } from "./tag-payload";

test("多个关键词会保留为 3 条独立标签", () => {
  const payload = buildManualTagPayload({
    videoId: "video-1",
    topicTag: "干货",
    contentKeywords: ["复盘", "热点", "龙头"],
  });

  assert.deepEqual(payload, [
    {
      video_id: "video-1",
      tag_dimension: "话题",
      tag_value: "干货",
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    },
    {
      video_id: "video-1",
      tag_dimension: "关键词",
      tag_value: "复盘",
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    },
    {
      video_id: "video-1",
      tag_dimension: "关键词",
      tag_value: "热点",
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    },
    {
      video_id: "video-1",
      tag_dimension: "关键词",
      tag_value: "龙头",
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    },
  ]);
});

test("单值维度保留最后一条，多值维度按值去重", () => {
  const deduped = dedupeTagPayloads([
    { tag_dimension: "题材", tag_value: "大盘复盘" },
    { tag_dimension: "关键词", tag_value: "复盘" },
    { tag_dimension: "表达形式", tag_value: "结论先行" },
    { tag_dimension: "题材", tag_value: "热点追踪" },
    { tag_dimension: "关键词", tag_value: "热点" },
    { tag_dimension: "关键词", tag_value: "复盘" },
  ]);

  assert.deepEqual(deduped, [
    { tag_dimension: "题材", tag_value: "热点追踪" },
    { tag_dimension: "表达形式", tag_value: "结论先行" },
    { tag_dimension: "关键词", tag_value: "复盘" },
    { tag_dimension: "关键词", tag_value: "热点" },
  ]);
});
