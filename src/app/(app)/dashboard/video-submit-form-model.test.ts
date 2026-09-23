import assert from "node:assert/strict";
import test from "node:test";

import {
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
} from "./video-submit-form-model";
import type { VideoSubmissionEditDetail } from "./video-submit-form-state";

const detail: VideoSubmissionEditDetail = {
  videoId: "video-1",
  accountId: "account-1",
  bizDate: "2026-08-25",
  dataSource: "manual",
  meta: {
    videoUrl: "https://www.douyin.com/video/1",
    videoTitle: "旧标题",
    content: "旧文案",
    publishedAt: "2026-08-24T12:30:00+08:00",
    publishedAtText: "昨天发布",
    anomalyStatus: "abnormal",
    punishType: "限流",
    platformNotice: "平台提示",
    appeal: "已申诉",
    topicTag: "干货",
    videoForm: "口播",
    contentKeywords: ["效率"],
    scriptAuthorUserId: "me",
    videoEditorUserId: "editor",
    operatorUserId: null,
  },
  metrics: {
    playCount: 0,
    likes: 12,
    comments: 3,
    shares: 4,
    favorites: 5,
    followerGain: 6,
    followerLoss: 0,
    followerConvert: 0,
    avgPlayDuration: 9.5,
    bounceRate2s: 10.25,
    completionRate5s: 11.75,
    completionRate: 12.5,
  },
  assets: [
    {
      role: "screenshot_1",
      url: "https://example.com/one",
      confirmed: true,
      confidenceScore: 0.96,
      recognizedFields: { play_count: 0 },
      screenshotType: "data",
    },
    {
      role: "screenshot_2",
      url: "https://example.com/two",
      confirmed: false,
      confidenceScore: 0.4,
      recognizedFields: { retention_metrics: { completion_rate: 12.5 } },
      screenshotType: "retention",
    },
  ],
  conversionScript: null,
  uploadedAt: "2026-08-25T10:00:00+08:00",
};

test("非法归属日期回退 today，初始岗位均归本人", () => {
  const meta = createInitialMeta("2026-08-25", "me", "bad-date");
  assert.equal(meta.bizDate, "2026-08-25");
  assert.deepEqual(
    [meta.scriptAuthorUserId, meta.videoEditorUserId, meta.operatorUserId],
    ["me", "me", "me"],
  );
  assert.deepEqual(meta.roleOverrides, []);
});

test("编辑回填区分本人、他人与空岗位", () => {
  const meta = createMetaFromEditDetail(detail, "2026-08-26", "me");
  assert.equal(meta.bizDate, "2026-08-25");
  assert.equal(meta.videoTitle, "旧标题");
  assert.equal(meta.operatorUserId, null);
  assert.deepEqual(meta.roleOverrides, ["video_editor"]);
});

test("零指标回填为 0，编辑指标仍由人工确认", () => {
  const fields = createEditableFieldsFromEditDetail(detail);
  assert.equal(fields.play_count.value, "0");
  assert.equal(fields.play_count.source, "manual");
  assert.equal(fields.play_count.confirmed, true);
  assert.equal(fields.play_count.requiresManualConfirmation, false);
  assert.equal(createEditableFields().play_count.value, "");
});

test("旧截图复用同一地址且不持有 File，待确认截图不被提升为已确认", () => {
  const slots = createEditableSlotsFromEditDetail(detail);
  assert.equal(slots.screenshot_1.assetUrl, detail.assets[0]?.url);
  assert.equal(slots.screenshot_1.previewUrl, detail.assets[0]?.url);
  assert.equal(slots.screenshot_1.file, null);
  assert.equal(slots.screenshot_1.status, "confirmed");
  assert.equal(slots.screenshot_2.status, "pending_confirm");
  assert.equal(slots.screenshot_2.confirmed, false);
  assert.equal(slots.screenshot_2.ocrFallback, true);
});

test("空 assets 保持初始空槽", () => {
  assert.deepEqual(createEditableSlotsFromEditDetail({ ...detail, assets: [] }), createEditableSlots());
});

test("createEditableFields 初始 confidenceLevel 均为 null，编辑回填也是 null", () => {
  const fields = createEditableFields();
  assert.equal(fields.play_count.confidenceLevel, null);
  assert.equal(fields.likes.confidenceLevel, null);

  const editFields = createEditableFieldsFromEditDetail(detail);
  assert.equal(editFields.play_count.confidenceLevel, null);
  assert.equal(editFields.likes.confidenceLevel, null);
});

import {
  summarizeSubmissionIssues,
  isInteractionExceedingPlayCount,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import { createInitialSubmissionState } from "@/components/submission/提交状态机";

test("toManualFieldState 会将 confidenceLevel 置为 null", () => {
  const state = toManualFieldState({
    key: "likes",
    value: "100",
    source: "ocr",
    requiresManualConfirmation: true,
    confirmed: false,
    confidenceLevel: "low",
  });
  assert.equal(state.confidenceLevel, null);
  assert.equal(state.source, "manual");
  assert.equal(state.confirmed, true);
});

test("isInteractionExceedingPlayCount 正确判定互动量总和超过播放量", () => {
  const normal = isInteractionExceedingPlayCount({
    play_count: "1000",
    likes: "100",
    comments: "50",
    shares: "30",
    favorites: "20",
  });
  assert.equal(normal.exceeded, false);
  assert.equal(normal.interactions, 200);
  assert.equal(normal.playCount, 1000);

  const exceeded = isInteractionExceedingPlayCount({
    play_count: "100",
    likes: "50",
    comments: "30",
    shares: "20",
    favorites: "10",
  });
  assert.equal(exceeded.exceeded, true);
  assert.equal(exceeded.interactions, 110);
  assert.equal(exceeded.playCount, 100);

  const zeroPlay = isInteractionExceedingPlayCount({
    play_count: "0",
    likes: "50",
    comments: "30",
    shares: "20",
    favorites: "10",
  });
  assert.equal(zeroPlay.exceeded, false);
});

test("summarizeSubmissionIssues 计算 firstInvalidFieldKey 优先级符合规范", () => {
  const emptyState = createInitialSubmissionState();
  // 1. 截图槽缺失 -> firstInvalidFieldKey 为 null
  const slotIssue = summarizeSubmissionIssues(emptyState, { anomalyStatus: "normal" });
  assert.equal(slotIssue.firstInvalidFieldKey, null);

  // 2. 异常模式免截图，指标缺项 -> firstInvalidFieldKey 为第一个缺失指标
  const metricIssue = summarizeSubmissionIssues(emptyState, { anomalyStatus: "abnormal" });
  assert.equal(metricIssue.firstInvalidFieldKey, "play_count");

  // 3. 指标填全，缺标题 -> firstInvalidFieldKey 为 "videoTitle"
  const filledFieldsState = createInitialSubmissionState();
  for (const key of Object.keys(filledFieldsState.fields) as Array<keyof typeof filledFieldsState.fields>) {
    filledFieldsState.fields[key].value = "100";
  }
  const metaIssue = summarizeSubmissionIssues(filledFieldsState, {
    anomalyStatus: "normal",
    videoTitle: "",
    content: "文案内容",
    topicTag: "干货",
  });
  // 截图槽缺 -> null
  assert.equal(metaIssue.firstInvalidFieldKey, null);

  // 槽位填好，缺标题
  const stateWithSlots = {
    ...filledFieldsState,
    slots: {
      screenshot_1: { ...filledFieldsState.slots.screenshot_1, status: "confirmed" as const, confirmed: true },
      screenshot_2: { ...filledFieldsState.slots.screenshot_2, status: "confirmed" as const, confirmed: true },
    },
  };
  const titleMissing = summarizeSubmissionIssues(stateWithSlots, {
    anomalyStatus: "normal",
    videoTitle: "",
    content: "文案内容",
    topicTag: "干货",
  });
  assert.equal(titleMissing.firstInvalidFieldKey, "videoTitle");

  // 4. 缺文案 -> "content"
  const contentMissing = summarizeSubmissionIssues(stateWithSlots, {
    anomalyStatus: "normal",
    videoTitle: "标题",
    content: "",
    topicTag: "干货",
  });
  assert.equal(contentMissing.firstInvalidFieldKey, "content");

  // 5. 缺话题标签 -> "topicTag"
  const topicTagMissing = summarizeSubmissionIssues(stateWithSlots, {
    anomalyStatus: "normal",
    videoTitle: "标题",
    content: "文案内容",
    topicTag: "",
  });
  assert.equal(topicTagMissing.firstInvalidFieldKey, "topicTag");
});
