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
    role: "screenshot_1",
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
      screenshot_1: createSlot({ status: "recognizing" }),
      screenshot_2: createSlot({ role: "screenshot_2" }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
    },
  });

  assert.equal(getSubmissionStage(state), "识别中");
});

test("必传槽已识别但未确认时为待确认", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "pending_confirm", requiresManualConfirmation: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
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
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
    },
    fields: {
      play_count: createField(),
      follower_gain: createField({ key: "follower_gain" }),
      follower_convert: createField({ key: "follower_convert" }),
      likes: createField({ key: "likes" }),
      comments: createField({ key: "comments" }),
      shares: createField({ key: "shares" }),
      favorites: createField({ key: "favorites" }),
      avg_play_duration: createField({ key: "avg_play_duration", value: "18", requiresManualConfirmation: true, confirmed: false }),
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
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
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

test("问题汇总会列出缺截图待确认字段和话题标签", () => {
  const { summarizeSubmissionIssues } = require("./提交状态机") as typeof import("./提交状态机");

  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot(),
      screenshot_2: createSlot({ role: "screenshot_2", status: "pending_confirm", requiresManualConfirmation: true }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
    },
    fields: {
      play_count: createField(),
      follower_gain: createField({ key: "follower_gain", value: "12" }),
      follower_convert: createField({ key: "follower_convert" }),
      likes: createField({ key: "likes", value: "30" }),
      comments: createField({ key: "comments", value: "" }),
      shares: createField({ key: "shares", value: "1" }),
      favorites: createField({ key: "favorites", value: "2" }),
      avg_play_duration: createField({ key: "avg_play_duration", value: "18", requiresManualConfirmation: true, confirmed: false }),
      bounce_rate_2s: createField({ key: "bounce_rate_2s", value: "50", requiresManualConfirmation: true, confirmed: false }),
      completion_rate_5s: createField({ key: "completion_rate_5s", value: "" }),
      completion_rate: createField({ key: "completion_rate", value: "10" }),
    },
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "",
    anomalyStatus: "正常",
  });

  assert.equal(summary.totalIssueCount, 8);
  assert.equal(summary.firstIssueAnchor, "slots");
  assert.deepEqual(summary.missingRequiredSlots, ["screenshot_1"]);
  assert.deepEqual(summary.pendingSlotConfirmations, ["screenshot_2"]);
  assert.deepEqual(summary.missingRequiredFields, ["play_count", "comments", "completion_rate_5s"]);
  assert.deepEqual(summary.unconfirmedFields, ["avg_play_duration", "bounce_rate_2s"]);
  assert.equal(summary.topicTagMissing, true);
  assert.equal(summary.canSubmit, false);
});

test("限流时留存字段为空不计入缺项", () => {
  const { summarizeSubmissionIssues } = require("./提交状态机") as typeof import("./提交状态机");

  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
      screenshot_3: createSlot({ role: "screenshot_3", required: false }),
    },
    fields: {
      play_count: createField({ value: "100" }),
      follower_gain: createField({ key: "follower_gain", value: "12" }),
      follower_convert: createField({ key: "follower_convert" }),
      likes: createField({ key: "likes", value: "30" }),
      comments: createField({ key: "comments", value: "4" }),
      shares: createField({ key: "shares", value: "1" }),
      favorites: createField({ key: "favorites", value: "2" }),
      avg_play_duration: createField({ key: "avg_play_duration", value: "" }),
      bounce_rate_2s: createField({ key: "bounce_rate_2s", value: "" }),
      completion_rate_5s: createField({ key: "completion_rate_5s", value: "" }),
      completion_rate: createField({ key: "completion_rate", value: "" }),
    },
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "干货",
    anomalyStatus: "限流",
  });

  assert.deepEqual(summary.missingRequiredFields, []);
  assert.equal(summary.totalIssueCount, 0);
  assert.equal(summary.canSubmit, true);
});

