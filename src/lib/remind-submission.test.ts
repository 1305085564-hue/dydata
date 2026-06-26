import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMissingStreakMap,
  buildRecentSubmissionMap,
  buildSubmissionStatus,
  getShanghaiDateString,
  shiftDateString,
} from "./remind-submission";

test("上海日期按东八区取值", () => {
  assert.equal(getShanghaiDateString(new Date("2026-04-20T16:30:00.000Z")), "2026-04-21");
  assert.equal(getShanghaiDateString(new Date("2026-04-20T15:30:00.000Z")), "2026-04-20");
});

test("提交状态同时兼容 user_id 和 account_id 归属", () => {
  const result = buildSubmissionStatus({
    today: "2026-04-21",
    profiles: [
      { id: "u1", name: "小王", role: "member", status: "active", exempt_type: null, exempt_start_date: null, exempt_end_date: null, exempt_reason: null },
      { id: "u2", name: "小李", role: "member", status: "active", exempt_type: null, exempt_start_date: null, exempt_end_date: null, exempt_reason: null },
      { id: "u3", name: "小赵", role: "member", status: "exempt", exempt_type: "permanent", exempt_start_date: null, exempt_end_date: null, exempt_reason: null },
      { id: "u4", name: "小孙", role: "member", status: "active", exempt_type: null, exempt_start_date: null, exempt_end_date: null, exempt_reason: null },
    ],
    accounts: [
      { id: "a1", profile_id: "u1" },
      { id: "a2", profile_id: "u2" },
    ],
    reports: [
      { user_id: null, account_id: "a1", report_date: "2026-04-21" },
      { user_id: "u2", account_id: null, report_date: "2026-04-21" },
    ],
  });

  assert.deepEqual(result, [
    { user_id: "u1", name: "小王", submitted: true },
    { user_id: "u2", name: "小李", submitted: true },
  ]);
});

test("连续未交天数按最近提交日截断", () => {
  const reportsByUser = buildRecentSubmissionMap({
    accounts: [{ id: "a1", profile_id: "u1" }],
    reports: [
      { user_id: null, account_id: "a1", report_date: "2026-04-18" },
      { user_id: "u2", account_id: null, report_date: "2026-04-20" },
    ],
  });

  const streakMap = buildMissingStreakMap({
    userIds: ["u1", "u2", "u3"],
    reportsByUser,
    today: "2026-04-21",
  });

  assert.deepEqual(Array.from(streakMap.entries()), [
    ["u1", 3],
    ["u3", 7],
  ]);
  assert.equal(shiftDateString("2026-04-21", -7), "2026-04-14");
});
