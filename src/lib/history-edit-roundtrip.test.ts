import assert from "node:assert/strict";
import test from "node:test";

import { classifyHistoryData } from "./history-data-capability";
import { parseNullableMetricInput } from "./video-24h-metrics-contract";

type HistoryRecord = {
  id: string;
  title: string;
  play_count: number;
  follower_convert: number | null;
  completion_rate: number | null;
};

function open(record: HistoryRecord) {
  return { ...record };
}

function save(original: HistoryRecord, input: Partial<Record<keyof HistoryRecord, string>>) {
  const next = { ...original };
  if (input.title !== undefined) next.title = input.title;
  if (input.play_count !== undefined) next.play_count = Number(input.play_count);
  if (input.follower_convert !== undefined) next.follower_convert = parseNullableMetricInput(input.follower_convert);
  if (input.completion_rate !== undefined) next.completion_rate = parseNullableMetricInput(input.completion_rate);
  return next;
}

test("打开→不改保存→再打开：null 不被默认值覆盖", () => {
  const stored: HistoryRecord = {
    id: "history-1",
    title: "旧标题",
    play_count: 100,
    follower_convert: null,
    completion_rate: null,
  };
  const opened = open(stored);
  const saved = save(stored, {});
  const reopened = open(saved);

  assert.deepEqual(reopened, opened);
  assert.equal(reopened.follower_convert, null);
  assert.equal(reopened.completion_rate, null);
});

test("只改标题保存→再打开：未修改指标保持 null 与 0 的原语义", () => {
  const stored: HistoryRecord = {
    id: "history-2",
    title: "旧标题",
    play_count: 200,
    follower_convert: 0,
    completion_rate: null,
  };
  const saved = save(stored, { title: "新标题" });
  const reopened = open(saved);

  assert.equal(reopened.title, "新标题");
  assert.equal(reopened.follower_convert, 0);
  assert.equal(reopened.completion_rate, null);
});

test("明确输入 0 才写入 0，空输入写入 null", () => {
  const stored: HistoryRecord = {
    id: "history-3",
    title: "标题",
    play_count: 300,
    follower_convert: null,
    completion_rate: null,
  };
  assert.equal(save(stored, { follower_convert: "0" }).follower_convert, 0);
  assert.equal(save(stored, { follower_convert: "" }).follower_convert, null);
});

test("历史分层结果可作为行为测试前置条件，而不是用完整夹具掩盖缺陷", () => {
  const result = classifyHistoryData({
    hasBoundVideo: true,
    hasExactlyOne24hSnapshot: true,
    hasRequiredMetrics: true,
    hasCompleteAttachments: false,
    hasOcrDetails: false,
    hasContent: true,
    hasUniqueUsageRecord: true,
    hasConsistentRelations: true,
  });
  assert.equal(result.editable, true);
  assert.equal(result.capability, "editable_without_attachments");
});
