import assert from "node:assert/strict";
import test from "node:test";

import { checkPendingExemptionOverlap } from "./exemption-application-precheck";

function client(options: {
  requests?: Array<{ id?: string; start_date: string; end_date: string | null }>;
  dates?: Array<{ request_id: string; request_date: string; status: string }>;
  requestError?: { message: string };
  dateError?: { message: string };
} = {}) {
  const calls: string[] = [];
  let category = "";
  const supabase = {
    from(table: string) {
      calls.push(table);
      if (table === "exemption_request") return {
        select(columns: string) {
          assert.equal(columns, "id, start_date, end_date");
          return this;
        },
        eq(column: string, value: string) {
          if (column === "applicant_user_id") assert.equal(value, "user-1");
          if (column === "request_status") assert.equal(value, "pending");
          if (column === "exemption_category") category = value;
          return this;
        },
        async limit(value: number) {
          assert.equal(value, 500);
          return { data: category === "leave" ? options.requests ?? [] : [], error: options.requestError ?? null };
        },
      };
      if (table === "exemption_request_date") return {
        select(columns: string) {
          assert.equal(columns, "request_id, request_date, status");
          return this;
        },
        async in(column: string, ids: string[]) {
          assert.equal(column, "request_id");
          assert.deepEqual(ids, (options.requests ?? []).map((row) => row.id).filter(Boolean));
          return { data: options.dates ?? [], error: options.dateError ?? null };
        },
      };
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase: supabase as never, calls };
}

const input = { applicantUserId: "user-1", category: "leave" as const, ranges: [{ start_date: "2026-09-01", end_date: null }] };

test("无 pending 不读逐日表；不同分类和不重叠日期允许申请", async () => {
  const empty = client();
  assert.deepEqual(await checkPendingExemptionOverlap(empty.supabase, input), { ok: true, overlappingDates: [] });
  assert.deepEqual(empty.calls, ["exemption_request"]);
  const other = client({ requests: [{ id: "r1", start_date: "2026-09-01", end_date: null }] });
  assert.deepEqual(await checkPendingExemptionOverlap(other.supabase, { ...input, category: "waive" }), { ok: true, overlappingDates: [] });
  const distinct = client({ requests: [{ id: "r1", start_date: "2026-08-30", end_date: null }] });
  assert.deepEqual(await checkPendingExemptionOverlap(distinct.supabase, input), { ok: true, overlappingDates: [] });
});

test("主表或逐日表查询失败返回阶段，不能视作空数据", async () => {
  const requestError = { message: "request unavailable" };
  const failedRequests = client({ requestError });
  assert.deepEqual(await checkPendingExemptionOverlap(failedRequests.supabase, input), { ok: false, stage: "requests", error: requestError });
  assert.deepEqual(failedRequests.calls, ["exemption_request"]);
  const dateError = { message: "dates unavailable" };
  const failedDates = client({ requests: [{ id: "r1", start_date: "2026-09-01", end_date: null }], dateError });
  assert.deepEqual(await checkPendingExemptionOverlap(failedDates.supabase, input), { ok: false, stage: "dates", error: dateError });
});

test("仅逐日 pending 阻拦；跨月交集去重排序；null 末日只算开始日", async () => {
  const fake = client({
    requests: [
      { id: "r1", start_date: "2026-08-30", end_date: "2026-09-02" },
      { id: "r2", start_date: "2026-09-01", end_date: null },
    ],
    dates: [
      { request_id: "r1", request_date: "2026-08-31", status: "pending" },
      { request_id: "r1", request_date: "2026-09-01", status: "approved" },
      { request_id: "r1", request_date: "2026-09-02", status: "pending" },
      { request_id: "r2", request_date: "2026-09-01", status: "pending" },
    ],
  });
  assert.deepEqual(await checkPendingExemptionOverlap(fake.supabase, {
    ...input,
    ranges: [{ start_date: "2026-09-02", end_date: null }, { start_date: "2026-08-31", end_date: "2026-09-02" }],
  }), { ok: true, overlappingDates: ["2026-08-31", "2026-09-01", "2026-09-02"] });
});
