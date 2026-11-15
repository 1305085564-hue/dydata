import assert from "node:assert/strict";
import test from "node:test";
import { listSubmitGaps, resolveFormProgress, resolveSubmitStep } from "./submit-gaps";
import { resolveMetricCellMode } from "@/components/submission/指标输入卡";

type Summary = Parameters<typeof resolveFormProgress>[0]["summary"];
const empty: Summary = {
  missingRequiredSlots: [],
  processingRequiredSlots: [],
  failedRequiredSlots: [],
  missingRequiredMetrics: [],
  missingRequiredMeta: [],
  topicTagMissing: false,
  publishedAtUnconfirmed: false,
  canSubmit: true,
};
const summary = (patch: Partial<Summary>): Summary => ({ ...empty, ...patch, canSubmit: false });

test("还差什么：按缺项汇总拼出按钮文字，顺序与状态机一致", () => {
  const gaps = listSubmitGaps(summary({
    missingRequiredSlots: ["screenshot_2"],
    missingRequiredMetrics: ["favorites"],
    missingRequiredMeta: ["content"],
    topicTagMissing: true,
  }));
  assert.deepEqual(gaps.map((gap) => gap.label), ["完播截图", "1 项数字", "文案", "题材"]);
  assert.equal(gaps[0].anchor, "slots");
});

test("类型未确认时增加截图缺口，并阻止进入可提交状态", () => {
  const withUnknown = { ...summary({}), unclassifiedScreenshotCount: 1 };
  assert.deepEqual(listSubmitGaps(withUnknown).map((gap) => gap.label), ["有一张截图没认出是哪类"]);
  assert.equal(
    resolveFormProgress({ summary: { ...withUnknown, canSubmit: true }, hasStartedFilling: true, allScreenshotsFailed: false }),
    "filling",
  );
});

test("表单进度：只差文案时页头说「还差一步」，齐了说「可以交了」", () => {
  assert.equal(resolveFormProgress({ summary: summary({ missingRequiredSlots: ["screenshot_1", "screenshot_2"], missingRequiredMeta: ["videoTitle", "content"] }), hasStartedFilling: false, allScreenshotsFailed: false }), "notStarted");
  assert.equal(resolveFormProgress({ summary: summary({ missingRequiredMeta: ["content"] }), hasStartedFilling: true, allScreenshotsFailed: false }), "onlyContent");
  assert.equal(resolveFormProgress({ summary: summary({ missingRequiredMeta: ["content"], topicTagMissing: true }), hasStartedFilling: true, allScreenshotsFailed: false }), "filling");
  assert.equal(resolveFormProgress({ summary: { ...empty }, hasStartedFilling: true, allScreenshotsFailed: false }), "ready");
  assert.equal(resolveFormProgress({ summary: summary({ missingRequiredMetrics: ["likes"] }), hasStartedFilling: true, allScreenshotsFailed: true }), "ocrFailed");
});

test("步骤条：缺截图在第一步，缺数字在核对，只差文案在粘贴文案，齐了在提交", () => {
  assert.equal(resolveSubmitStep(summary({ missingRequiredSlots: ["screenshot_1"] })), 0);
  assert.equal(resolveSubmitStep(summary({ missingRequiredMetrics: ["likes"] })), 1);
  assert.equal(resolveSubmitStep(summary({ missingRequiredMeta: ["content"] })), 2);
  assert.equal(resolveSubmitStep({ ...empty }), 3);
});

test("指标格：认出来的是字，没认准、没认出的才是输入框", () => {
  const field = (value: string, source: "ocr" | "manual" = "ocr") => ({ value, source });
  const base = { optional: false, slotProcessing: false, inputsOpen: true };
  assert.equal(resolveMetricCellMode({ ...base, field: field("12486"), confidenceLevel: "high" }), "settled");
  assert.equal(resolveMetricCellMode({ ...base, field: field("96"), confidenceLevel: "low" }), "doubt");
  assert.equal(resolveMetricCellMode({ ...base, field: field("96", "manual"), confidenceLevel: null }), "settled");
  assert.equal(resolveMetricCellMode({ ...base, field: field(""), confidenceLevel: null }), "missing");
  assert.equal(resolveMetricCellMode({ ...base, optional: true, field: field(""), confidenceLevel: null }), "blank");
  assert.equal(resolveMetricCellMode({ ...base, inputsOpen: false, field: field(""), confidenceLevel: null }), "blank");
  assert.equal(resolveMetricCellMode({ ...base, slotProcessing: true, field: field(""), confidenceLevel: null }), "pending");
});
