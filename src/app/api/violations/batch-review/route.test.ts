import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildBatchReviewViolationsResponse } from "./route";

type CaseRow = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level?: string | null;
  admin_conclusion?: string | null;
  suggested_action?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  is_deleted: boolean;
};

function createRequest(body: unknown) {
  return new NextRequest("https://dydata.cc/api/violations/batch-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createBatchReviewSupabase(rows: CaseRow[]) {
  let pendingId: string | null = null;
  let pendingDeleted = false;

  return {
    from(table: string) {
      assert.equal(table, "violation_cases");

      const findTarget = () => rows.find((row) => row.id === pendingId && row.is_deleted === pendingDeleted);

      return {
        select(query: string) {
          assert.equal(
            query,
            "id,status,usage_state,risk_level,admin_conclusion,suggested_action",
          );

          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              return this;
            },
            async single() {
              const target = findTarget();
              if (!target) {
                return { data: null, error: { message: "not found" } };
              }
              return {
                data: {
                  id: target.id,
                  status: target.status,
                  usage_state: target.usage_state,
                  risk_level: target.risk_level ?? null,
                  admin_conclusion: target.admin_conclusion ?? null,
                  suggested_action: target.suggested_action ?? null,
                },
                error: null,
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              return this;
            },
            select() {
              return {
                async single() {
                  const target = findTarget();
                  if (!target) {
                    return { data: null, error: { message: "not found" } };
                  }
                  Object.assign(target, payload);
                  return { data: { id: target.id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("batch review approve 返回成功失败汇总并写入审批字段", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      status: "submitted",
      usage_state: "testing",
      risk_level: "high",
      admin_conclusion: "旧结论",
      suggested_action: "旧建议",
      is_deleted: false,
    },
  ];

  const response = await buildBatchReviewViolationsResponse(
    createRequest({ ids: ["case-1", "case-missing"], action: "approve" }),
    {
      getAuthenticatedContext: async () => ({
        supabase: createBatchReviewSupabase(rows),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createBatchReviewSupabase(rows),
    },
  );

  assert.equal(response.status, 200);

  const json = await response.json();
  assert.equal(json.success, 1);
  assert.equal(json.failed, 1);
  assert.equal(Array.isArray(json.errors), true);
  assert.match(String(json.errors[0]), /case-missing/);
  assert.deepEqual(json.snapshots, [
    {
      id: "case-1",
      status: "submitted",
      usage_state: "testing",
      risk_level: "high",
      admin_conclusion: "旧结论",
      suggested_action: "旧建议",
    },
  ]);

  assert.equal(rows[0].status, "verified");
  assert.equal(rows[0].usage_state, "available");
  assert.equal(rows[0].reviewed_by, "owner-1");
  assert.match(String(rows[0].reviewed_at), /T/);
});

test("batch review reject 缺少结论时返回 400", async () => {
  const response = await buildBatchReviewViolationsResponse(
    createRequest({ ids: ["case-1"], action: "reject" }),
    {
      getAuthenticatedContext: async () => ({
        supabase: createBatchReviewSupabase([]),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createBatchReviewSupabase([]),
    },
  );

  assert.equal(response.status, 400);
});
