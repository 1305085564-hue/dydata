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
