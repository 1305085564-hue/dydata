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
  applyOcrMetricValues,
  canRestoreOcrValue,
  restoreOcrFieldValue,
} from "@/components/submission/填报表单状态";
import { createInitialSubmissionState } from "@/components/submission/提交状态机";
import { parseMetricFieldOrNull } from "@/lib/dashboard-logic/use-video-submit-form";

test("createEditableFields 初始没有 OCR 原值，也没有手改标记", () => {
  const fields = createEditableFields();

  assert.equal(fields.play_count.ocrValue, null);
  assert.equal(fields.play_count.ocrConfidenceLevel, null);
  assert.equal(fields.play_count.manuallyEdited, false);
});

test("OCR 首次识别写入当前值、原值与置信度", () => {
  const next = applyOcrMetricValues(
    createEditableFields(),
    { play_count: 1200, likes: 80, comments: null },
    { play_count: "high", likes: "low" },
  );

  assert.equal(next.play_count.value, "1200");
  assert.equal(next.play_count.ocrValue, "1200");
  assert.equal(next.play_count.source, "ocr");
  assert.equal(next.play_count.confidenceLevel, "high");
  assert.equal(next.play_count.confirmed, true);
  assert.equal(next.likes.value, "80");
  assert.equal(next.likes.ocrValue, "80");
  assert.equal(next.likes.confidenceLevel, "low");

  // 识别不到（null）的字段保持原样，不冒充 OCR 来源
  assert.equal(next.comments.value, "");
  assert.equal(next.comments.ocrValue, null);
  assert.equal(next.comments.source, "manual");
});

test("手改字段不被二次识别覆盖，但该字段的 OCR 原值会刷新", () => {
  const recognized = applyOcrMetricValues(createEditableFields(), {
    play_count: 1200,
    likes: 80,
  });
  const edited = {
    ...recognized,
    play_count: toManualFieldState({ ...recognized.play_count, value: "1300" }),
  };

  const reRecognized = applyOcrMetricValues(edited, {
    play_count: 2000,
    likes: 90,
  });

  // 手改值保留，来源仍是 manual，不带上任何识别置信度
  assert.equal(reRecognized.play_count.value, "1300");
  assert.equal(reRecognized.play_count.source, "manual");
  assert.equal(reRecognized.play_count.confidenceLevel, null);
  // 原值按最新一次识别刷新，供「恢复识别值」使用
  assert.equal(reRecognized.play_count.ocrValue, "2000");
  // 没手改过的字段照常采用最新识别值
  assert.equal(reRecognized.likes.value, "90");
  assert.equal(reRecognized.likes.ocrValue, "90");
});

test("恢复识别值只还原该字段，并把字段交回 OCR 管理", () => {
  const recognized = applyOcrMetricValues(createEditableFields(), {
    play_count: 1200,
    likes: 80,
  });
  const edited = {
    ...recognized,
    play_count: toManualFieldState({ ...recognized.play_count, value: "1300" }),
  };
  const reRecognized = applyOcrMetricValues(edited, {
    play_count: 2000,
    likes: 90,
  });
  assert.equal(canRestoreOcrValue(reRecognized.play_count), true);

  const restored = {
    ...reRecognized,
    play_count: restoreOcrFieldValue(reRecognized.play_count),
  };

  assert.equal(restored.play_count.value, "2000");
  assert.equal(restored.play_count.source, "ocr");
  assert.equal(restored.play_count.manuallyEdited, false);
  assert.equal(restored.play_count.confirmed, true);
  // 恢复后值与原值一致，恢复入口自动收起
  assert.equal(canRestoreOcrValue(restored.play_count), false);
  // 其他字段不受影响
  assert.equal(restored.likes.value, "90");

  // 交回 OCR 管理后，再识别一次可以正常刷新当前值
  const nextRound = applyOcrMetricValues(restored, { play_count: 3000 });
  assert.equal(nextRound.play_count.value, "3000");
});

test("没有可恢复原值的字段不提供恢复入口，也不会被恢复动作改动", () => {
  const modelFields = createEditableFields();
  const legacyEditFields = createEditableFieldsFromEditDetail(detail);

  for (const fields of [modelFields, legacyEditFields]) {
    assert.equal(canRestoreOcrValue(fields.play_count), false);
    assert.equal(restoreOcrFieldValue(fields.play_count), fields.play_count);
  }

  // 旧草稿里没有 ocrValue 字段时同样按「无原值」处理，不推断历史识别值
  const legacyDraftField = { ...modelFields.play_count, value: "10" };
  delete (legacyDraftField as { ocrValue?: unknown }).ocrValue;
  assert.equal(canRestoreOcrValue(legacyDraftField), false);
  assert.equal(restoreOcrFieldValue(legacyDraftField), legacyDraftField);
});

test("识别失败或缺字段时不擦除已有有效值", () => {
  const recognized = applyOcrMetricValues(createEditableFields(), { play_count: 1200 });

  assert.equal(applyOcrMetricValues(recognized, null), recognized);
  assert.equal(applyOcrMetricValues(recognized, {}), recognized);
  assert.equal(applyOcrMetricValues(recognized, undefined), recognized);

  // 留存截图只识别出部分指标时，其余指标保持用户当前状态
  const partial = applyOcrMetricValues(recognized, { avg_play_duration: null });
  assert.equal(partial, recognized);
  assert.equal(partial.avg_play_duration.value, "");
  assert.equal(partial.avg_play_duration.source, "manual");
});

test("提交仍取字段当前显示值，OCR 原值不参与提交", () => {
  const recognized = applyOcrMetricValues(createEditableFields(), { play_count: 1200 });
  const edited = {
    ...recognized,
    play_count: toManualFieldState({ ...recognized.play_count, value: "1300" }),
  };
  const final = applyOcrMetricValues(edited, { play_count: 2000 });

  assert.equal(final.play_count.value, "1300");
  assert.equal(final.play_count.ocrValue, "2000");
  // 提交链路读的是当前值（parseMetricFieldOrNull 只吃 value），不是 OCR 原值
  assert.equal(parseMetricFieldOrNull("play_count", final.play_count.value), 1300);
  assert.notEqual(parseMetricFieldOrNull("play_count", final.play_count.value), 2000);
});

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
