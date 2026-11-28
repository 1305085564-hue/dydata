import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRecentExemptionReviewNotices,
  pickRecentReviewNotices,
  type ReviewNoticeDailyRow,
  type ReviewNoticeRequestRow,
} from "./dashboard-exemption-review";

const NOW = new Date("2026-11-18T04:00:00Z");
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

const request = (id: string, patch: Partial<ReviewNoticeRequestRow> = {}): ReviewNoticeRequestRow => ({
  id, request_status: "approved", exemption_type: "range", exemption_category: "leave",
  start_date: "2026-11-10", end_date: "2026-11-14", reason: "家里有事", reviewed_at: at(1), created_at: at(3), ...patch,
});
const daily = (request_id: string, request_date: string, status: ReviewNoticeDailyRow["status"], feedback: string | null = null, reviewed_at: string | null = at(1)): ReviewNoticeDailyRow =>
  ({ request_id, request_date, status, feedback, reviewed_by: "admin-1", reviewed_at });

test("批 4 天驳 1 天：员工拿到一条申请的逐日结果，通过和驳回日期、驳回理由都在", () => {
  const notices = pickRecentReviewNotices(
    [request("r1")],
    [
      daily("r1", "2026-11-10", "approved"), daily("r1", "2026-11-11", "approved"),
      daily("r1", "2026-11-12", "approved"), daily("r1", "2026-11-13", "approved"),
      daily("r1", "2026-11-14", "rejected", "这天有排班，不能请假"),
    ],
    NOW,
  );
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0].daily_results?.map((d) => [d.date, d.status, d.feedback]).slice(3), [
    ["2026-11-13", "approved", null],
    ["2026-11-14", "rejected", "这天有排班，不能请假"],
  ]);
});

test("近 7 天内审批过的申请全部返回（最新在前），超过 7 天的不再打扰", () => {
  const notices = pickRecentReviewNotices(
    [request("old", { reviewed_at: at(8) }), request("a", { reviewed_at: at(5) }), request("b", { reviewed_at: at(1), request_status: "rejected" })],
    [daily("old", "2026-11-01", "approved", null, at(8)), daily("a", "2026-11-05", "approved", null, at(5)), daily("b", "2026-11-12", "rejected", "原因", at(1))],
    NOW,
  );
  assert.deepEqual(notices.map((n) => n.id), ["b", "a"]);
});

test("过去日期被驳回也要让员工看到：不再因为日期早于今天就隐藏", () => {
  const notices = pickRecentReviewNotices(
    [request("r1", { request_status: "rejected", start_date: "2026-10-05", end_date: "2026-10-05" })],
    [daily("r1", "2026-10-05", "rejected", "补充材料")],
    NOW,
  );
  assert.equal(notices.length, 1);
});

test("部分批准（整单仍 pending）带逐日结果；全部仍 pending 的不产生通知", () => {
  const notices = pickRecentReviewNotices(
    [request("partial", { request_status: "pending", reviewed_at: null }), request("allpending", { request_status: "pending", reviewed_at: null })],
    [
      daily("partial", "2026-11-10", "approved"), daily("partial", "2026-11-11", "pending", null, null),
      daily("allpending", "2026-11-12", "pending", null, null),
    ],
    NOW,
  );
  assert.deepEqual(notices.map((n) => n.id), ["partial"]);
});

test("读取：只查本人、近 7 天已结单与待审单，两类结果合并后返回", async () => {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const supabase = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const builder = {
        select() { return builder; },
        eq(col: string, value: unknown) { call.filters.push([col, value]); return builder; },
        in(col: string, value: unknown) { call.filters.push([col, value]); return builder; },
        gte(col: string, value: unknown) { call.filters.push([col, value]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          if (table === "exemption_request_date") {
            return resolve({ data: [daily("r1", "2026-11-12", "rejected", "理由")], error: null });
          }
          const isPending = call.filters.some(([col, value]) => col === "request_status" && value === "pending");
          resolve({ data: isPending ? [] : [request("r1", { request_status: "rejected" })], error: null });
        },
      };
      return pagedQueryDouble(builder);
    },
  };
  const notices = await loadRecentExemptionReviewNotices(supabase as never, "user-1", NOW);
  assert.deepEqual(notices.map((n) => n.id), ["r1"]);
  assert.ok(calls.filter((c) => c.table === "exemption_request").every((c) => c.filters.some(([col, v]) => col === "applicant_user_id" && v === "user-1")));
  assert.ok(calls.some((c) => c.filters.some(([col, v]) => col === "reviewed_at" && v === at(7))));
});
