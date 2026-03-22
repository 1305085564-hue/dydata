import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmit,
  createInitialSubmissionState,
  getSubmissionStage,
  type SubmissionFieldState,
  type SubmissionSlotState,
} from "./提交状态机";

function createSlot(overrides: Partial<SubmissionSlotState> = {}): SubmissionSlotState {
  return {
    role: "overview",
    required: true,
    status: "empty",
    confidenceScore: null,
    requiresManualConfirmation: false,
    confirmed: false,
    ...overrides,
  };
}

function createField(overrides: Partial<SubmissionFieldState> = {}): SubmissionFieldState {
  return {
    key: "play_count",
    value: "",
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    ...overrides,
  };
}

test("初始状态为草稿", () => {
  const state = createInitialSubmissionState();
  assert.equal(getSubmissionStage(state), "草稿");
});

test("存在上传中或识别中槽位时为识别中", () => {
  const state = createInitialSubmissionState({
    slots: {
      overview: createSlot({ status: "recognizing" }),
      traffic_curve: createSlot({ role: "traffic_curve" }),
      retention_curve: createSlot({ role: "retention_curve" }),
      engagement_extra: createSlot({ role: "engagement_extra", required: false }),
      other: createSlot({ role: "other", required: false }),
    },
  });

  assert.equal(getSubmissionStage(state), "识别中");
});

test("必传槽已识别但未确认时为待确认", () => {
  const state = createInitialSubmissionState({
    slots: {
      overview: createSlot({ status: "pending_confirm", requiresManualConfirmation: true }),
      traffic_curve: createSlot({ role: "traffic_curve", status: "confirmed", confirmed: true }),
      retention_curve: createSlot({ role: "retention_curve", status: "confirmed", confirmed: true }),
      engagement_extra: createSlot({ role: "engagement_extra", required: false }),
      other: createSlot({ role: "other", required: false }),
    },
  });

  assert.equal(getSubmissionStage(state), "待确认");
  assert.deepEqual(canSubmit(state), {
    ok: false,
    reason: "请先确认必传截图槽位",
  });
});

test("低置信字段未人工确认时不可提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      overview: createSlot({ status: "confirmed", confirmed: true }),
      traffic_curve: createSlot({ role: "traffic_curve", status: "confirmed", confirmed: true }),
      retention_curve: createSlot({ role: "retention_curve", status: "confirmed", confirmed: true }),
      engagement_extra: createSlot({ role: "engagement_extra", required: false }),
      other: createSlot({ role: "other", required: false }),
    },
    fields: {
      play_count: createField(),
      follower_gain: createField({ key: "follower_gain" }),
      follower_convert: createField({ key: "follower_convert" }),
      likes: createField({ key: "likes" }),
      comments: createField({ key: "comments" }),
      shares: createField({ key: "shares" }),
      favorites: createField({ key: "favorites" }),
      avg_play_duration: createField({ key: "avg_play_duration", requiresManualConfirmation: true, confirmed: false }),
      bounce_rate_2s: createField({ key: "bounce_rate_2s" }),
      completion_rate_5s: createField({ key: "completion_rate_5s" }),
      completion_rate: createField({ key: "completion_rate" }),
    },
  });

  assert.equal(getSubmissionStage(state), "待确认");
  assert.deepEqual(canSubmit(state), {
    ok: false,
    reason: "请先确认低置信字段",
  });
});

test("必传槽和低置信字段都确认后可提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      overview: createSlot({ status: "confirmed", confirmed: true }),
      traffic_curve: createSlot({ role: "traffic_curve", status: "confirmed", confirmed: true }),
      retention_curve: createSlot({ role: "retention_curve", status: "confirmed", confirmed: true }),
      engagement_extra: createSlot({ role: "engagement_extra", required: false }),
      other: createSlot({ role: "other", required: false }),
    },
    fields: {
      play_count: createField(),
      follower_gain: createField({ key: "follower_gain" }),
      follower_convert: createField({ key: "follower_convert" }),
      likes: createField({ key: "likes" }),
      comments: createField({ key: "comments" }),
      shares: createField({ key: "shares" }),
      favorites: createField({ key: "favorites" }),
      avg_play_duration: createField({ key: "avg_play_duration" }),
      bounce_rate_2s: createField({ key: "bounce_rate_2s" }),
      completion_rate_5s: createField({ key: "completion_rate_5s" }),
      completion_rate: createField({ key: "completion_rate" }),
    },
  });

  assert.equal(getSubmissionStage(state), "可提交");
  assert.deepEqual(canSubmit(state), {
    ok: true,
    reason: null,
  });
});

test("提交完成后状态为已提交", () => {
  const state = createInitialSubmissionState({ submitted: true });
  assert.equal(getSubmissionStage(state), "已提交");
});
