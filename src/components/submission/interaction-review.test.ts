import test from "node:test";
import assert from "node:assert/strict";

import { resolveMetricCellMode } from "./指标输入卡";
import {
  getInteractionAnomalyReviewReason,
  type EditableFieldState,
} from "./填报表单状态";
import { canSubmit, createInitialSubmissionState } from "./提交状态机";
import { resolveMetricToCheckCount } from "./指标分组区";

function playCountField(value: string): EditableFieldState {
  return {
    key: "play_count",
    value,
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
  };
}

test("互动总数超过播放量时播放量进入请核对状态，修正后自动清除", () => {
  const anomalous = {
    play_count: "100",
    likes: "50",
    comments: "30",
    shares: "20",
    favorites: "10",
  };
  const reason = getInteractionAnomalyReviewReason(anomalous);
  assert.equal(reason, "点赞、评论、转发、收藏加起来比播放量还多");
  assert.equal(resolveMetricCellMode({
    field: playCountField(anomalous.play_count),
    confidenceLevel: null,
    optional: false,
    slotProcessing: false,
    inputsOpen: false,
    forceReview: reason !== null,
  }), "doubt");
  assert.equal(resolveMetricToCheckCount([
    { key: "play_count", mode: "doubt", value: anomalous.play_count },
  ]), 1);

  const fixed = { ...anomalous, play_count: "110" };
  const fixedReason = getInteractionAnomalyReviewReason(fixed);
  assert.equal(fixedReason, null);
  assert.equal(resolveMetricCellMode({
    field: playCountField(fixed.play_count),
    confidenceLevel: null,
    optional: false,
    slotProcessing: false,
    inputsOpen: false,
    forceReview: fixedReason !== null,
  }), "settled");
});

test("播放量为零但互动数为正时也提示核对，空播放量不触发比较", () => {
  assert.equal(getInteractionAnomalyReviewReason({
    play_count: "0",
    likes: "1",
    comments: "",
    shares: "",
    favorites: "",
  }), "点赞、评论、转发、收藏加起来比播放量还多");
  assert.equal(getInteractionAnomalyReviewReason({
    play_count: "",
    likes: "1",
    comments: "",
    shares: "",
    favorites: "",
  }), null);
});

test("互动异常只提示核对，不阻断已满足必填项的提交", () => {
  const state = createInitialSubmissionState();
  for (const field of Object.values(state.fields)) field.value = "1";
  state.fields.play_count.value = "100";
  state.fields.likes.value = "50";
  state.fields.comments.value = "30";
  state.fields.shares.value = "20";
  state.fields.favorites.value = "10";
  for (const slot of Object.values(state.slots)) {
    slot.status = "confirmed";
    slot.confirmed = true;
  }

  assert.equal(getInteractionAnomalyReviewReason({
    play_count: state.fields.play_count.value,
    likes: state.fields.likes.value,
    comments: state.fields.comments.value,
    shares: state.fields.shares.value,
    favorites: state.fields.favorites.value,
  }) !== null, true);
  assert.equal(canSubmit(state, {
    anomalyStatus: "normal",
    submissionMode: "create",
    topicTag: "复盘",
    videoTitle: "标题",
    content: "文案",
    publishedAtConfirmed: true,
  }).ok, true);
});
