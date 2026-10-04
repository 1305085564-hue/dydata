import assert from "node:assert/strict";
import test from "node:test";

import {
  countDailyReportsForUser,
  loadActiveDailyReports,
  loadDailyReportForCorrection,
  loadDailyReportForUser,
  loadDailyReportUserIdsForDate,
  loadRecentUserDailyReports,
} from "./daily-reports";

function createQueryRecorder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query = {
    select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
    eq(...args: unknown[]) { calls.push({ method: "eq", args }); return query; },
    in(...args: unknown[]) { calls.push({ method: "in", args }); return query; },
    order(...args: unknown[]) { calls.push({ method: "order", args }); return query; },
    limit(...args: unknown[]) { calls.push({ method: "limit", args }); return query; },
    gte(...args: unknown[]) { calls.push({ method: "gte", args }); return query; },
    lte(...args: unknown[]) { calls.push({ method: "lte", args }); return query; },
    single(...args: unknown[]) { calls.push({ method: "single", args }); return query; },
    then(resolve: (value: { data: null; error: null }) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return { client: { from: () => query }, calls };
}

test("日报 loader 保留近期查询的字段、过滤与排序契约", async () => {
  const { client, calls } = createQueryRecorder();
  await loadRecentUserDailyReports(client as never, "user-1");
  assert.deepEqual(calls, [
    { method: "select", args: ["id, report_date, play_count, likes, comments, shares, favorites, follower_gain"] },
    { method: "eq", args: ["user_id", "user-1"] },
    { method: "eq", args: ["is_void", false] },
    { method: "order", args: ["report_date", { ascending: false }] },
    { method: "limit", args: [10] },
  ]);
});

test("日报 loader 保留范围、日期与空结果查询契约", async () => {
  const { client, calls } = createQueryRecorder();
  await loadDailyReportUserIdsForDate(client as never, "2026-10-04", ["user-1", "user-2"]);
  assert.deepEqual(calls, [
    { method: "select", args: ["user_id"] },
    { method: "eq", args: ["report_date", "2026-10-04"] },
    { method: "in", args: ["user_id", ["user-1", "user-2"]] },
  ]);

  calls.length = 0;
  await loadActiveDailyReports(client as never, ["user-1"], { start: "2026-10-01", end: "2026-10-04" });
  assert.deepEqual(calls, [
    { method: "select", args: ["id, user_id, report_date, play_count"] },
    { method: "eq", args: ["is_void", false] },
    { method: "order", args: ["report_date", { ascending: false }] },
    { method: "limit", args: [500] },
    { method: "in", args: ["user_id", ["user-1"]] },
    { method: "gte", args: ["report_date", "2026-10-01"] },
    { method: "lte", args: ["report_date", "2026-10-04"] },
  ]);
});

test("日报 loader 保留单条修正、计数与归属读取契约", async () => {
  const { client, calls } = createQueryRecorder();
  await loadDailyReportForCorrection(client as never, "report-1");
  assert.deepEqual(calls, [
    { method: "select", args: ["id, user_id, report_date, title, play_count"] },
    { method: "eq", args: ["id", "report-1"] },
    { method: "single", args: [] },
  ]);

  calls.length = 0;
  await countDailyReportsForUser(client as never, "user-1");
  assert.deepEqual(calls, [
    { method: "select", args: ["id"] },
    { method: "eq", args: ["user_id", "user-1"] },
  ]);

  calls.length = 0;
  await loadDailyReportForUser(client as never, "report-1");
  assert.deepEqual(calls, [
    { method: "select", args: ["id, user_id, account_id"] },
    { method: "eq", args: ["id", "report-1"] },
    { method: "eq", args: ["is_void", false] },
    { method: "single", args: [] },
  ]);
});
