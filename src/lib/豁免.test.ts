import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllExemptionDates,
  getPendingExemptionDatesFromRequests,
  materializePendingExemptionRequestRows,
  getExemptionStateForDate,
  type ExemptionProfileLike,
} from "./豁免";

test("单日免交在指定日期生效并返回员工侧免交标签", () => {
  const profile: ExemptionProfileLike = {
    id: "u1",
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: "2026-03-20",
    exempt_end_date: "2026-03-20",
    exempt_reason: "休市",
    exemption_category: "waive",
  };

  const result = getExemptionStateForDate(profile, "2026-03-20");

  assert.equal(result.isExempt, true);
  assert.equal(result.label, "免交");
  assert.equal(result.category, "waive");
  assert.equal(result.reason, "休市");
});

test("历史空类别在员工侧仍显示为免交", () => {
  const profile: ExemptionProfileLike = {
    id: "u1-legacy",
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: "2026-03-20",
    exempt_end_date: "2026-03-20",
    exempt_reason: "历史兼容",
    exemption_category: null,
  };

  const result = getExemptionStateForDate(profile, "2026-03-20");
  assert.equal(result.isExempt, true);
  assert.equal(result.label, "免交");
  assert.equal(result.category, "waive");
});

test("多日请假仅在范围内生效", () => {
  const profile: ExemptionProfileLike = {
    id: "u2",
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: "2026-03-20",
    exempt_end_date: "2026-03-22",
    exempt_reason: "病假",
    exemption_category: "leave",
  };

  assert.equal(getExemptionStateForDate(profile, "2026-03-19").isExempt, false);
  assert.equal(getExemptionStateForDate(profile, "2026-03-21").label, "请假");
  assert.equal(getExemptionStateForDate(profile, "2026-03-23").isExempt, false);
});

test("已批准的历史 grant 也会返回免交状态", () => {
  const profile: ExemptionProfileLike = {
    id: "u11",
    status: "active",
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
    exemption_category: null,
  };

  const grants = [
    {
      user_id: "u11",
      start_date: "2026-04-02",
      end_date: "2026-04-03",
      grant_type: "range",
      exemption_category: "waive" as const,
      status: "active",
      created_at: "2026-04-04T08:00:00.000Z",
    },
  ];

  const state = getExemptionStateForDate(profile, "2026-04-02", grants);
  assert.equal(state.isExempt, true);
  assert.equal(state.label, "免交");
  assert.equal(state.category, "waive");
});

test("getAllExemptionDates 跨月提取所有生效豁免日期", () => {
  const profile: ExemptionProfileLike = {
    id: "u12",
    status: "active",
    exempt_type: "temporary",
    exempt_start_date: "2026-08-30",
    exempt_end_date: "2026-08-31",
    exempt_reason: "月底请假",
    exemption_category: "leave",
  };

  const grants = [
    {
      user_id: "u12",
      start_date: "2026-09-01",
      end_date: "2026-09-02",
      grant_type: "range",
      exemption_category: "waive" as const,
      status: "active",
      created_at: "2026-09-01T08:00:00.000Z",
    },
  ];

  const allBuckets = getAllExemptionDates(profile, grants);
  assert.deepEqual(allBuckets.leaveDates, ["2026-08-30", "2026-08-31"]);
  assert.deepEqual(allBuckets.waiveDates, ["2026-09-01", "2026-09-02"]);
});

test("pending 日期优先读取逐日明细，部分批准后只保留仍待审日期", () => {
  const requests = [{
    id: "request-1",
    start_date: "2026-09-01",
    end_date: "2026-09-05",
    reason: "多日申请",
  }];
  const details = [
    { request_id: "request-1", request_date: "2026-09-01", status: "approved" },
    { request_id: "request-1", request_date: "2026-09-02", status: "pending" },
    { request_id: "request-1", request_date: "2026-09-03", status: "rejected" },
    { request_id: "request-1", request_date: "2026-09-04", status: "pending" },
  ];

  assert.deepEqual(getPendingExemptionDatesFromRequests(requests, details), [
    "2026-09-02",
    "2026-09-04",
  ]);
  assert.deepEqual(
    materializePendingExemptionRequestRows(requests, details).map((row) => [
      row.start_date,
      row.end_date,
      row.reason,
    ]),
    [
      ["2026-09-02", "2026-09-02", "多日申请"],
      ["2026-09-04", "2026-09-04", "多日申请"],
    ],
  );
});

test("pending 日期缺少逐日明细时兼容存量整单区间", () => {
  const requests = [{
    id: "legacy-request",
    start_date: "2026-09-01",
    end_date: "2026-09-03",
    reason: "存量申请",
  }];

  assert.deepEqual(getPendingExemptionDatesFromRequests(requests), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
});
