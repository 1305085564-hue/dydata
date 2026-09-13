import test from "node:test";
import assert from "node:assert/strict";

import {
  areSubmissionScreenshotsRequired,
  canSubmit,
  createInitialSubmissionState,
  getSubmissionStage,
  summarizeSubmissionIssues,
  type SubmissionFieldState,
  type SubmissionSlotState,
} from "./提交状态机";

const COMPLETE_REQUIRED_FIELDS = {
  play_count: createField({ key: "play_count", value: "100" }),
  follower_gain: createField({ key: "follower_gain", value: "12" }),
  follower_convert: createField({ key: "follower_convert", value: "0" }),
  likes: createField({ key: "likes", value: "30" }),
  comments: createField({ key: "comments", value: "4" }),
  shares: createField({ key: "shares", value: "1" }),
  favorites: createField({ key: "favorites", value: "2" }),
  avg_play_duration: createField({ key: "avg_play_duration", value: "18" }),
  bounce_rate_2s: createField({ key: "bounce_rate_2s", value: "50" }),
  completion_rate_5s: createField({ key: "completion_rate_5s", value: "20" }),
  completion_rate: createField({ key: "completion_rate", value: "10" }),
};

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
    },
  });

  assert.equal(getSubmissionStage(state), "识别中");
  assert.deepEqual(canSubmit(state), {
    ok: false,
    reason: "截图正在上传或识别，请稍候",
  });
});

test("必传槽已识别但未确认时为待确认", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "pending_confirm", requiresManualConfirmation: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  assert.equal(getSubmissionStage(state), "可提交");
  assert.deepEqual(canSubmit(state), {
    ok: true,
    reason: null,
  });
});

test("pending_confirm 且未确认的截图只进入警告列表，不阻断提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "pending_confirm", confirmed: false, requiresManualConfirmation: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
  });

  assert.equal(summary.canSubmit, true);
  assert.deepEqual(canSubmit(state, { anomalyStatus: "正常" }), {
    ok: true,
    reason: null,
  });
  assert.deepEqual(summary.unconfirmedSlots, ["screenshot_1"]);
  assert.equal(summary.totalIssueCount, 0);
});


test("OCR 失败但截图已上传并转手输时不再卡住提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true, requiresManualConfirmation: false }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "pending_confirm", confirmed: true, requiresManualConfirmation: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
  });

  assert.deepEqual(summary.failedRequiredSlots, []);
  assert.deepEqual(summary.unconfirmedSlots, []);
  assert.equal(summary.canSubmit, true);
  assert.deepEqual(canSubmit(state, { anomalyStatus: "正常" }), {
    ok: true,
    reason: null,
  });
});


test("上传两张必传截图后即可提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  assert.equal(getSubmissionStage(state), "可提交");
  assert.deepEqual(canSubmit(state), {
    ok: true,
    reason: null,
  });
});

test("问题汇总保留截图、必填指标和话题标签缺项", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot(),
      screenshot_2: createSlot({ role: "screenshot_2", status: "pending_confirm", requiresManualConfirmation: true }),
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

  assert.equal(summary.totalIssueCount, 5);
  assert.equal(summary.firstIssueAnchor, "slots");
  assert.deepEqual(summary.missingRequiredSlots, ["screenshot_1"]);
  assert.deepEqual(summary.unconfirmedSlots, ["screenshot_2"]);
  assert.deepEqual(summary.missingRequiredMetrics, ["play_count", "follower_convert", "comments"]);
  assert.equal(summary.topicTagMissing, true);
  assert.equal(summary.canSubmit, false);
});

test("7 项必填指标任一为空会阻断提交，并提示补全", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: {
      ...COMPLETE_REQUIRED_FIELDS,
      comments: createField({ key: "comments", value: "" }),
    },
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
  });

  assert.equal(summary.canSubmit, false);
  assert.deepEqual(summary.missingRequiredMetrics, ["comments"]);
  assert.equal(summary.firstIssueAnchor, "metrics");
  assert.match(summary.reason ?? "", /补全/);
  assert.deepEqual(canSubmit(state, { anomalyStatus: "正常" }), {
    ok: false,
    reason: "请补全 1 项必填指标（留空不再视为 0）",
  });
});

test("留存 4 项全空但 7 项必填齐全时放行", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: {
      ...COMPLETE_REQUIRED_FIELDS,
      avg_play_duration: createField({ key: "avg_play_duration", value: "" }),
      bounce_rate_2s: createField({ key: "bounce_rate_2s", value: "" }),
      completion_rate_5s: createField({ key: "completion_rate_5s", value: "" }),
      completion_rate: createField({ key: "completion_rate", value: "" }),
    },
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
  });

  assert.deepEqual(summary.missingRequiredMetrics, []);
  assert.equal(summary.canSubmit, true);
});

test("failed 槽位且无图未确认时阻断提交", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "failed", confirmed: false }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
  });

  assert.equal(summary.canSubmit, false);
  assert.deepEqual(summary.failedRequiredSlots, ["screenshot_1"]);
  assert.equal(summary.firstIssueAnchor, "slots");
});

test("标题和文案缺失时仍不能提交，但不再要求内容标签", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "",
    content: "",
    contentKeywords: [],
  });

  assert.deepEqual(summary.missingRequiredMeta, ["videoTitle", "content"]);
  assert.equal(summary.firstIssueAnchor, "meta");
  assert.equal(summary.canSubmit, false);
});

test("标题、文案和话题标签齐全时可提交，即使内容标签为空", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "正常",
    videoTitle: "标题",
    content: "文案",
    contentKeywords: [],
  });

  assert.deepEqual(summary.missingRequiredMeta, []);
  assert.equal(summary.canSubmit, true);
});

test("异常状态下截图改为可选", () => {
  const state = createInitialSubmissionState({
    fields: COMPLETE_REQUIRED_FIELDS,
  });

  const summary = summarizeSubmissionIssues(state, {
    topicTag: "复盘",
    anomalyStatus: "限流",
    videoTitle: "标题",
    content: "文案",
    contentKeywords: ["热点"],
  });

  assert.equal(areSubmissionScreenshotsRequired("正常"), true);
  assert.equal(areSubmissionScreenshotsRequired("normal"), true);
  assert.equal(areSubmissionScreenshotsRequired("限流"), false);
  assert.equal(areSubmissionScreenshotsRequired("abnormal"), false);
  assert.deepEqual(summary.missingRequiredSlots, []);
  assert.equal(summary.canSubmit, true);
  assert.deepEqual(canSubmit(state, { anomalyStatus: "限流" }), {
    ok: true,
    reason: null,
  });
});


test("限流时留存字段为空不计入缺项", () => {
  const state = createInitialSubmissionState({
    slots: {
      screenshot_1: createSlot({ status: "confirmed", confirmed: true }),
      screenshot_2: createSlot({ role: "screenshot_2", status: "confirmed", confirmed: true }),
    },
    fields: {
      play_count: createField({ value: "100" }),
      follower_gain: createField({ key: "follower_gain", value: "12" }),
      follower_convert: createField({ key: "follower_convert", value: "0" }),
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

  assert.equal(summary.totalIssueCount, 0);
  assert.equal(summary.canSubmit, true);
});
