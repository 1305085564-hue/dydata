import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePassRate,
  getUtcWeekStartIso,
  mapRecentViolations,
  selectConversionTop3,
  selectDangerousTop3,
  selectSafeTop3,
} from "./dashboard-summary";

test("dashboard summary 按真实通过率挑出最危险 Top3", () => {
  const rows = [
    { id: "a", script_text: "A", pass_count: 1, fail_count: 4 },
    { id: "b", script_text: "B", pass_count: 0, fail_count: 3 },
    { id: "c", script_text: "C", pass_count: 2, fail_count: 3 },
    { id: "d", script_text: "D", pass_count: 10, fail_count: 0 },
    { id: "e", script_text: "E", pass_count: 1, fail_count: 1 },
  ];

  const result = selectDangerousTop3(rows);

  assert.deepEqual(
    result.map((item) => ({ id: item.id, pass_rate: item.pass_rate })),
    [
      { id: "b", pass_rate: 0 },
      { id: "a", pass_rate: 20 },
      { id: "c", pass_rate: 40 },
    ],
  );
});

test("dashboard summary 只保留通过率 80% 以上且样本数足够的最安全 Top3", () => {
  const rows = [
    { id: "a", script_text: "A", pass_count: 8, fail_count: 2 },
    { id: "b", script_text: "B", pass_count: 9, fail_count: 1 },
    { id: "c", script_text: "C", pass_count: 4, fail_count: 1 },
    { id: "d", script_text: "D", pass_count: 2, fail_count: 0 },
    { id: "e", script_text: "E", pass_count: 7, fail_count: 3 },
  ];

  const result = selectSafeTop3(rows);

  assert.deepEqual(
    result.map((item) => ({ id: item.id, pass_rate: item.pass_rate })),
    [
      { id: "b", pass_rate: 90 },
      { id: "c", pass_rate: 80 },
      { id: "a", pass_rate: 80 },
    ],
  );
});

test("dashboard summary 通过率按整数四舍五入", () => {
  assert.equal(calculatePassRate(8, 1), 89);
  assert.equal(calculatePassRate(0, 0), null);
});

test("dashboard summary 周起点按 UTC 周一 00:00 计算", () => {
  const iso = getUtcWeekStartIso(new Date("2026-05-27T15:20:10.000Z"));
  assert.equal(iso, "2026-05-25T00:00:00.000Z");
});

test("dashboard summary 最近违规列表兼容 submitter join 的对象和数组形态", () => {
  const result = mapRecentViolations([
    {
      id: "a",
      script_text: "  第一条脚本  ",
      created_at: "2026-05-26T10:00:00.000Z",
      risk_level: "high",
      submitter: { name: "张三" },
    },
    {
      id: "b",
      script_text: "第二条脚本",
      created_at: "2026-05-26T11:00:00.000Z",
      risk_level: null,
      submitter: [{ name: null }],
    },
  ]);

  assert.deepEqual(result, [
    {
      id: "a",
      script_text: "第一条脚本",
      created_at: "2026-05-26T10:00:00.000Z",
      risk_level: "high",
      submitter_name: "张三",
    },
    {
      id: "b",
      script_text: "第二条脚本",
      created_at: "2026-05-26T11:00:00.000Z",
      risk_level: null,
      submitter_name: "未知",
    },
  ]);
});

test("dashboard summary 会格式化转化 Top3，并过滤低样本案例", () => {
  const result = selectConversionTop3([
    {
      id: "a",
      script_text: "  高转化脚本  ",
      total_views: 1000,
      total_follows: 60,
      usage_count: 6,
      weighted_conversion_rate: 0.06,
    },
    {
      id: "b",
      script_text: "样本不足",
      total_views: 100,
      total_follows: 10,
      usage_count: 2,
      weighted_conversion_rate: 0.1,
    },
    {
      id: "c",
      script_text: "第二名",
      total_views: 800,
      total_follows: 32,
      usage_count: 5,
      weighted_conversion_rate: 0.04,
    },
  ]);

  assert.deepEqual(result, [
    {
      id: "a",
      script_text: "高转化脚本",
      conversion_rate: "6.00%",
      usage_count: 6,
    },
    {
      id: "c",
      script_text: "第二名",
      conversion_rate: "4.00%",
      usage_count: 5,
    },
  ]);
});
