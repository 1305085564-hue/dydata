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

test("原样保存不把手工来源降级", () => {
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

test("换图重新识别能把历史手工标记还原为 AI", () => {
  const existing: DailyReportDataSource = "manual";
  assert.equal(
    resolveDailyReportDataSource({
      existing,
      hasOcrRecognizedFields: true,
      hasManualEdit: false,
      screenshotsRefreshed: true,
    }),
    "ai",
  );
});

test("换图之后又手改过数字，仍然算手工", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: "manual",
      hasOcrRecognizedFields: true,
      hasManualEdit: true,
      screenshotsRefreshed: true,
    }),
    "manual",
  );
});

test("没换图也没识别到字段时保留历史手工", () => {
  assert.equal(
    resolveDailyReportDataSource({
      existing: "manual",
      hasOcrRecognizedFields: false,
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
