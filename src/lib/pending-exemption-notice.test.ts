import test from "node:test";
import assert from "node:assert/strict";

import { buildPendingExemptionNoticeCopy } from "./pending-exemption-notice";

test("待审批通知按请假和免交类别显示标题与具体日期", () => {
  assert.deepEqual(buildPendingExemptionNoticeCopy([
    { date: "2026-11-20", category: "leave" },
    { date: "2026-11-21", category: "leave" },
  ]), {
    title: "请假审批中",
    description: "· 11月20日、11月21日",
  });
  assert.equal(buildPendingExemptionNoticeCopy([
    { date: "2026-11-20", category: "waive" },
  ]).title, "免交审批中");
  assert.equal(buildPendingExemptionNoticeCopy([
    { date: "2026-11-20", category: "leave" },
    { date: "2026-11-21", category: "waive" },
  ]).title, "请假/免交审批中");
});

test("三天及以上的连续日期折叠，超过四段只列前三段并计剩余天数", () => {
  assert.equal(buildPendingExemptionNoticeCopy([
    { date: "2026-11-20", category: "leave" },
    { date: "2026-11-21", category: "leave" },
    { date: "2026-11-22", category: "leave" },
    { date: "2026-11-23", category: "leave" },
  ]).description, "· 11月20日–11月23日");

  assert.equal(buildPendingExemptionNoticeCopy([
    "2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07", "2026-11-09", "2026-11-10",
  ].map((date) => ({ date, category: "waive" as const })).concat([
    { date: "2026-11-11", category: "waive" as const },
  ])).description, "· 11月1日、11月3日、11月5日、等 4 天");
});
