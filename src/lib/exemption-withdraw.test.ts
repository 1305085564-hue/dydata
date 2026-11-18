import assert from "node:assert/strict";
import test from "node:test";

import { withdrawPendingExemptionRequests } from "./exemption-withdraw";

type Row = Record<string, unknown>;

/** 内存版申请表：delete 只删满足全部过滤条件的行，和数据库行级规则同一语义。 */
function fakeClient(state: {
  requests: Row[];
  dates: Row[];
  failOn?: "pending" | "dates" | "delete";
}) {
  const deletedFilters: Array<[string, string, unknown]> = [];
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let mode: "select" | "delete" = "select";
    const source = () => (table === "exemption_request" ? state.requests : state.dates);
    const matches = (row: Row) => filters.every(([op, col, value]) => {
      if (op === "eq") return row[col] === value;
      if (op === "neq") return row[col] !== value;
      return (value as unknown[]).includes(row[col]);
    });
    const builder = {
      select() { return builder; },
      delete() { mode = "delete"; return builder; },
      eq(col: string, value: unknown) { filters.push(["eq", col, value]); return builder; },
      neq(col: string, value: unknown) { filters.push(["neq", col, value]); return builder; },
      in(col: string, value: unknown[]) { filters.push(["in", col, value]); return builder; },
      then(resolve: (value: { data: Row[] | null; error: unknown }) => void) {
        if (mode === "delete") {
          deletedFilters.push(...filters);
          if (state.failOn === "delete") return resolve({ data: null, error: { message: "boom" } });
          const hit = source().filter(matches);
          state.requests = state.requests.filter((row) => !hit.includes(row));
          state.dates = state.dates.filter((row) => !hit.some((request) => request.id === row.request_id));
          return resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
        }
        const failing = (table === "exemption_request" && state.failOn === "pending") || (table === "exemption_request_date" && state.failOn === "dates");
        resolve({ data: failing ? null : source().filter(matches), error: failing ? { message: "boom" } : null });
      },
    };
    return builder;
  }
  return { client: { from } as never, state, deletedFilters };
}

const pendingRequest = (id: string, user = "user-1") => ({ id, applicant_user_id: user, request_status: "pending" });

test("撤回本人待审批申请：申请和逐日明细一起没了，管理员侧不再有这条", async () => {
  const { client, state } = fakeClient({
    requests: [pendingRequest("r1"), pendingRequest("r2", "user-2")],
    dates: [{ request_id: "r1", request_date: "2026-11-10", status: "pending" }, { request_id: "r2", request_date: "2026-11-10", status: "pending" }],
  });
  const result = await withdrawPendingExemptionRequests(client, "user-1");
  assert.deepEqual(result, { ok: true, withdrawn: 1, skippedReviewed: 0 });
  assert.deepEqual(state.requests.map((row) => row.id), ["r2"]);
  assert.deepEqual(state.dates.map((row) => row.request_id), ["r2"]);
});

test("已有日期被审批过的申请（部分通过）不能整单撤回，不抹掉已审结果", async () => {
  const { client, state } = fakeClient({
    requests: [pendingRequest("r1"), pendingRequest("r2")],
    dates: [
      { request_id: "r1", request_date: "2026-11-10", status: "approved" },
      { request_id: "r1", request_date: "2026-11-11", status: "pending" },
      { request_id: "r2", request_date: "2026-11-12", status: "pending" },
    ],
  });
  const result = await withdrawPendingExemptionRequests(client, "user-1");
  assert.deepEqual(result, { ok: true, withdrawn: 1, skippedReviewed: 1 });
  assert.deepEqual(state.requests.map((row) => row.id), ["r1"]);

  const onlyPartial = fakeClient({
    requests: [pendingRequest("r1")],
    dates: [{ request_id: "r1", request_date: "2026-11-10", status: "rejected" }],
  });
  const blocked = await withdrawPendingExemptionRequests(onlyPartial.client, "user-1");
  assert.equal(blocked.ok, false);
  assert.equal(!blocked.ok && blocked.status, 409);
  assert.equal(onlyPartial.state.requests.length, 1);
});

test("没有待审批申请（已被处理）时明确告知，查询或删除失败按失败处理", async () => {
  const none = await withdrawPendingExemptionRequests(fakeClient({ requests: [{ id: "r1", applicant_user_id: "user-1", request_status: "approved" }], dates: [] }).client, "user-1");
  assert.equal(!none.ok && none.status, 409);
  for (const failOn of ["pending", "dates", "delete"] as const) {
    const failed = await withdrawPendingExemptionRequests(fakeClient({ requests: [pendingRequest("r1")], dates: [], failOn }).client, "user-1");
    assert.equal(!failed.ok && failed.status, 500, failOn);
  }
});

test("删除条件带上本人和仍待审，防止并发审批后误删", async () => {
  const { client, deletedFilters } = fakeClient({ requests: [pendingRequest("r1")], dates: [] });
  await withdrawPendingExemptionRequests(client, "user-1");
  assert.ok(deletedFilters.some(([op, col, value]) => op === "eq" && col === "applicant_user_id" && value === "user-1"));
  assert.ok(deletedFilters.some(([op, col, value]) => op === "eq" && col === "request_status" && value === "pending"));
});
