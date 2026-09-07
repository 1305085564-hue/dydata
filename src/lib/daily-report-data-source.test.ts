import test from "node:test";
import assert from "node:assert/strict";

import {
  hasActualFieldChange,
  normalizeDailyReportDataSource,
  resolveDailyReportDataSource,
  type DailyReportDataSource,
} from "./daily-report-data-source";

test("截图识别后未手工改动，保留 AI 来源", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: null,
      hasOcrRecognizedFields: true,
      hasManualEdit: false,
    }),
    "ai",
  );
});

test("手工修改任一字段会升级为手工", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: "ai",
      hasOcrRecognizedFields: true,
      hasManualEdit: true,
    }),
    "manual",
  );
});

test("原样保存不把 AI 来源改成手工", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: "ai",
      hasOcrRecognizedFields: false,
      hasManualEdit: false,
    }),
    "ai",
  );
});

test("手工状态不能被草稿恢复后的原样保存或重新 OCR 降级", () => {
  const existing: DailyReportDataSource = "manual";
  assert.equal(
    resolveDailyReportDataSource({
      existing,
      hasOcrRecognizedFields: true,
      hasManualEdit: false,
    }),
    "manual",
  );
});

test("没有来源依据且未做手工操作时保持历史未知", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: null,
      hasOcrRecognizedFields: false,
      hasManualEdit: false,
    }),
    null,
  );
});

test("历史来源只接受 AI 或手工，空值和异常值都保持未知", () => {
  assert.equal(normalizeDailyReportDataSource("ai"), "ai");
  assert.equal(normalizeDailyReportDataSource("manual"), "manual");
  assert.equal(normalizeDailyReportDataSource(null), null);
  assert.equal(normalizeDailyReportDataSource("ocr"), null);
});

test("只有新旧字段值实际不同才算手工修改", () => {
  assert.equal(hasActualFieldChange("原值", "原值"), false);
  assert.equal(hasActualFieldChange(null, null), false);
  assert.equal(hasActualFieldChange("原值", "新值"), true);
  assert.equal(hasActualFieldChange("0", 0), true);
});
