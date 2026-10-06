import assert from "node:assert/strict";
import test from "node:test";

import { createEditableSlots } from "../video-submit-form-model";
import { createQualityCheckController } from "./quality-check-controller";

test("quality check controller keeps a failed check non-blocking and clears loading", async () => {
  const qualityStates: Array<{ data: unknown; loading: boolean }> = [];
  const errors: string[] = [];
  const controller = createQualityCheckController({
    submittedReportId: "report-1",
    setHasUserInteracted: () => undefined,
    setQualityCheck: (next) => qualityStates.push(next as { data: unknown; loading: boolean }),
    setIsSubmitted: () => undefined,
    updateSlotsState: () => undefined,
    fetchImpl: async () => {
      throw new Error("network down");
    },
    onError: (message) => errors.push(message),
    onManualReview: () => undefined,
  });

  await controller.handleQualityCheck();

  assert.equal(qualityStates[0]?.loading, true);
  assert.deepEqual(qualityStates.at(-1), { data: null, loading: false });
  assert.equal(errors[0], "AI 检查未完成，不影响您直接提交");
});

test("quality check controller stores a successful result and can reset both screenshot slots", async () => {
  const qualityStates: Array<{ data: unknown; loading: boolean }> = [];
  const submittedStates: boolean[] = [];
  let slots = createEditableSlots();
  const controller = createQualityCheckController({
    submittedReportId: "report-1",
    setHasUserInteracted: () => undefined,
    setQualityCheck: (next) => qualityStates.push(next as { data: unknown; loading: boolean }),
    setIsSubmitted: (next) => submittedStates.push(next as boolean),
    updateSlotsState: (updater) => {
      slots = updater(slots);
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          reportId: "report-1",
          overallStatus: "pass",
          issues: [],
          checkedAt: "2026-10-01T10:00:00.000Z",
        }),
        { status: 200 },
      ),
    onError: () => undefined,
    onManualReview: () => undefined,
  });

  await controller.handleQualityCheck();
  assert.equal((qualityStates.at(-1)?.data as { overallStatus: string }).overallStatus, "pass");

  slots = {
    ...slots,
    screenshot_1: { ...slots.screenshot_1, status: "confirmed", confirmed: true },
    screenshot_2: { ...slots.screenshot_2, status: "pending_confirm" },
  };
  controller.handleFixIssue({
    severity: "critical",
    title: "重新上传",
    detail: "截图需要更新",
    suggestedFix: "reupload_screenshot",
  });

  assert.deepEqual(submittedStates, [false]);
  assert.equal(slots.screenshot_1.status, "empty");
  assert.equal(slots.screenshot_2.status, "empty");
});
