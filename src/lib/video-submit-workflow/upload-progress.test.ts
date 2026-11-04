import assert from "node:assert/strict";
import test from "node:test";

import { createEditableSlots } from "@/app/(app)/dashboard/video-submit-form-model";
import { getUploadProgress } from "./upload-progress";

test("长等待严格超过 10 秒才触发，并列出当前处理槽位", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.status = "uploading";
  slots.screenshot_1.startedAt = 1_000;
  slots.screenshot_1.phaseStartedAt = 1_000;
  slots.screenshot_2.status = "recognizing";
  slots.screenshot_2.startedAt = 2_000;
  slots.screenshot_2.phaseStartedAt = 8_000;

  const atBoundary = getUploadProgress(slots, 11_000);
  assert.equal(atBoundary.screenshot_1.elapsedMs, 10_000);
  assert.equal(atBoundary.screenshot_1.isLongWaiting, false);
  assert.equal(atBoundary.screenshot_2.phaseElapsedMs, 3_000);
  assert.deepEqual(atBoundary.activeRoles, ["screenshot_1", "screenshot_2"]);
  assert.equal(atBoundary.isLongWaiting, false);

  const beyondBoundary = getUploadProgress(slots, 11_001);
  assert.equal(beyondBoundary.screenshot_1.isLongWaiting, true);
  assert.equal(beyondBoundary.screenshot_2.isLongWaiting, false);
  assert.equal(beyondBoundary.isLongWaiting, true);
});

test("已结束槽位冻结耗时且不再报告长等待", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.status = "pending_confirm";
  slots.screenshot_1.startedAt = 1_000;
  slots.screenshot_1.phaseStartedAt = 5_000;
  slots.screenshot_1.finishedAt = 8_000;

  const progress = getUploadProgress(slots, 50_000);
  assert.equal(progress.screenshot_1.elapsedMs, 7_000);
  assert.equal(progress.screenshot_1.phaseElapsedMs, 3_000);
  assert.equal(progress.screenshot_1.isLongWaiting, false);
  assert.equal(progress.isLongWaiting, false);
  assert.deepEqual(progress.activeRoles, []);
});

test("串行同批两张图每张 8 秒时，总等待超过 10 秒会触发", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.status = "pending_confirm";
  slots.screenshot_1.startedAt = 0;
  slots.screenshot_1.phaseStartedAt = 0;
  slots.screenshot_1.finishedAt = 8_000;
  slots.screenshot_1.batchStartedAt = 0;
  slots.screenshot_2.status = "recognizing";
  slots.screenshot_2.startedAt = 8_000;
  slots.screenshot_2.phaseStartedAt = 8_000;
  slots.screenshot_2.batchStartedAt = 0;

  const atBoundary = getUploadProgress(slots, 10_000);
  assert.equal(atBoundary.screenshot_2.elapsedMs, 2_000);
  assert.equal(atBoundary.screenshot_2.batchStartedAt, 0);
  assert.equal(atBoundary.screenshot_2.isLongWaiting, false);
  assert.equal(atBoundary.totalElapsedMs, 10_000);
  assert.equal(atBoundary.isLongWaiting, false);

  const beyondBoundary = getUploadProgress(slots, 10_001);
  assert.equal(beyondBoundary.screenshot_2.elapsedMs, 2_001);
  assert.equal(beyondBoundary.screenshot_2.isLongWaiting, false);
  assert.equal(beyondBoundary.totalElapsedMs, 10_001);
  assert.equal(beyondBoundary.isLongWaiting, true);
});

test("新一批正在处理的截图不继承旧批次已完成图片的等待时间", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.status = "pending_confirm";
  slots.screenshot_1.startedAt = 0;
  slots.screenshot_1.phaseStartedAt = 0;
  slots.screenshot_1.finishedAt = 8_000;
  slots.screenshot_1.batchStartedAt = 0;
  slots.screenshot_2.status = "recognizing";
  slots.screenshot_2.startedAt = 20_000;
  slots.screenshot_2.phaseStartedAt = 20_000;
  slots.screenshot_2.batchStartedAt = 20_000;

  const progress = getUploadProgress(slots, 20_001);
  assert.equal(progress.screenshot_2.elapsedMs, 1);
  assert.equal(progress.totalElapsedMs, 1);
  assert.equal(progress.isLongWaiting, false);
});
