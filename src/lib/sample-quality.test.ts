import test from "node:test";
import assert from "node:assert/strict";

import {
  countIssueSeverities,
  inferOverallStatus,
  normalizeSampleQualityIssues,
  parseSampleQualityResult,
} from "./sample-quality";

test("样本质量结果会清洗合法问题并统计严重级别", () => {
  const issues = normalizeSampleQualityIssues([
    { severity: "critical", title: " 缺截图 ", detail: " 无法核对 ", field: " image ", suggestedFix: "reupload_screenshot" },
    { severity: "warning", title: "数据偏低", detail: "请人工确认" },
    { severity: "invalid", title: "忽略", detail: "忽略" },
    null,
  ]);

  assert.equal(issues.length, 2);
  assert.deepEqual(countIssueSeverities(issues), { critical: 1, warning: 1, info: 0 });
  assert.equal(inferOverallStatus(issues), "fail");
});

test("空问题列表通过，非法 JSON 返回 null", () => {
  assert.deepEqual(normalizeSampleQualityIssues(null), []);
  assert.equal(inferOverallStatus([]), "pass");
  assert.equal(parseSampleQualityResult("not-json", "report-1", "2026-07-18"), null);
});

test("解析结果会在状态缺失时按问题推断", () => {
  const result = parseSampleQualityResult(
    '```json\n{"issues":[{"severity":"warning","title":"待确认","detail":"数值为0"}]}\n```',
    "report-1",
    "2026-07-18T00:00:00.000Z",
  );

  assert.equal(result?.overallStatus, "warning");
  assert.equal(result?.issues[0]?.detail, "数值为0");
});
