import assert from "node:assert/strict";
import test from "node:test";

import {
  countProcessingScreenshotItems,
  createScreenshotItemsFromEditDetail,
  deriveSlotsFromItems,
} from "./video-submit-form-model";
import type { ScreenshotItem } from "./video-submit-form-model";
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
    { role: "screenshot_1", url: "https://example.com/one", confirmed: true, confidenceScore: 0.96, recognizedFields: { play_count: 0 }, screenshotType: "data" },
    { role: "screenshot_2", url: "https://example.com/two", confirmed: false, confidenceScore: 0.4, recognizedFields: { retention_metrics: { completion_rate: 12.5 } }, screenshotType: "retention" },
  ],
  uploadedAt: "2026-08-25T10:00:00+08:00",
};

function screenshotItem(overrides: Partial<ScreenshotItem> = {}): ScreenshotItem {
  return {
    id: "item-1", seq: 1, file: null, status: "done", screenshotType: "data",
    recognizedFields: { play_count: 100 }, assetUrl: "https://example.com/item-1",
    previewUrl: "https://example.com/item-1", bucket: "submission-screenshots",
    path: "account/item-1.png", storageRole: "screenshot_1", fileName: "item-1.png",
    confidenceScore: 0.9, requiresManualConfirmation: false, confirmed: true, ...overrides,
  };
}

test("截图清单按 seq 取每类最新一张，数组顺序不影响派生槽位", () => {
  const slots = deriveSlotsFromItems([
    screenshotItem({ id: "retention-old", seq: 2, screenshotType: "retention", storageRole: "screenshot_2" }),
    screenshotItem({ id: "data-new", seq: 4, storageRole: "screenshot_2" }),
    screenshotItem({ id: "data-old", seq: 1, storageRole: "screenshot_1" }),
    screenshotItem({ id: "retention-new", seq: 5, screenshotType: "retention", storageRole: "screenshot_1" }),
  ]);
  assert.equal(slots.screenshot_1.itemId, "data-new");
  assert.equal(slots.screenshot_1.screenshotType, "data");
  assert.equal(slots.screenshot_2.itemId, "retention-new");
  assert.equal(slots.screenshot_2.screenshotType, "retention");
});

test("在途项和判不出项按 seq 填剩余槽位，并保留手动确认状态", () => {
  const slots = deriveSlotsFromItems([
    screenshotItem({ id: "data-done", seq: 1 }),
    screenshotItem({ id: "unknown", seq: 2, screenshotType: null, confirmed: false, requiresManualConfirmation: true }),
    screenshotItem({ id: "processing", seq: 3, status: "recognizing", screenshotType: null, assetUrl: null, previewUrl: "blob:processing" }),
  ]);
  assert.equal(slots.screenshot_1.itemId, "data-done");
  assert.equal(slots.screenshot_2.itemId, "unknown");
  assert.equal(slots.screenshot_2.status, "pending_confirm");
  assert.equal(slots.screenshot_2.screenshotType, null);
  assert.equal(countProcessingScreenshotItems([
    screenshotItem({ id: "uploading", status: "uploading" }),
    screenshotItem({ id: "recognizing", status: "recognizing" }),
    screenshotItem({ id: "done", status: "done" }),
  ]), 2);
});

test("编辑回填没有类型时沿用旧槽位约定", () => {
  const items = createScreenshotItemsFromEditDetail({
    ...detail,
    assets: detail.assets.map((asset) => ({ ...asset, screenshotType: null })),
  });
  assert.deepEqual(items.map((item) => item.screenshotType), ["data", "retention"]);
  assert.deepEqual(items.map((item) => item.status), ["done", "done"]);
});
