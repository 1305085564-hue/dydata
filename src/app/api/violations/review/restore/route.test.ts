import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest, NextResponse } from "next/server";

import { buildRestoreViolationReviewResponse } from "./route";

type Snapshot = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

type CaseRow = Snapshot & {
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_deleted: boolean;
};

function createRequest(body: unknown) {
  return new NextRequest("https://dydata.cc/api/violations/review/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createRestoreSupabase(rows: CaseRow[]) {
  let pendingId: string | null = null;
  let pendingDeleted = false;

  return {
    from(table: string) {
      assert.equal(table, "violation_cases");

      return {
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              return this;
            },
            select(query: string) {
              assert.equal(query, "id");
              return {
                async single() {
                  const target = rows.find((row) => row.id === pendingId && row.is_deleted === pendingDeleted);
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

test("restore 单条恢复成功返回 restored=1", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      status: "verified",
      usage_state: "available",
      risk_level: "high",
      admin_conclusion: "审批后结论",
      suggested_action: "审批后建议",
      reviewed_by: "owner-1",
      reviewed_at: "2026-05-28T10:00:00.000Z",
      is_deleted: false,
    },
  ];

  const response = await buildRestoreViolationReviewResponse(
    createRequest({
      snapshots: [
        {
          id: "case-1",
          status: "submitted",
          usage_state: "testing",
          risk_level: "medium",
          admin_conclusion: "旧结论",
          suggested_action: "旧建议",
        },
      ],
    }),
    {
      getAuthenticatedContext: async () => ({
        supabase: createRestoreSupabase(rows),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createRestoreSupabase(rows),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.restored, 1);
  assert.equal(json.failed, 0);
  assert.equal(rows[0].status, "submitted");
  assert.equal(rows[0].usage_state, "testing");
  assert.equal(rows[0].risk_level, "medium");
  assert.equal(rows[0].admin_conclusion, "旧结论");
  assert.equal(rows[0].suggested_action, "旧建议");
  assert.equal(rows[0].reviewed_by, "owner-1");
  assert.equal(rows[0].reviewed_at, "2026-05-28T10:00:00.000Z");
});

test("restore 多条恢复时跳过不存在 ID 并返回 errors", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      status: "verified",
      usage_state: "available",
      risk_level: "high",
      admin_conclusion: "审批后结论",
      suggested_action: "审批后建议",
      reviewed_by: "owner-1",
      reviewed_at: "2026-05-28T10:00:00.000Z",
      is_deleted: false,
    },
  ];

  const response = await buildRestoreViolationReviewResponse(
    createRequest({
      snapshots: [
        {
          id: "case-1",
          status: "submitted",
          usage_state: "testing",
          risk_level: "medium",
          admin_conclusion: "旧结论",
          suggested_action: "旧建议",
        },
        {
          id: "case-missing",
          status: "submitted",
          usage_state: null,
          risk_level: null,
          admin_conclusion: null,
          suggested_action: null,
        },
      ],
    }),
    {
      getAuthenticatedContext: async () => ({
        supabase: createRestoreSupabase(rows),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createRestoreSupabase(rows),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.restored, 1);
  assert.equal(json.failed, 1);
  assert.deepEqual(json.errors, ["case-missing: 恢复失败"]);
});

test("restore 越权时返回 403", async () => {
  const response = await buildRestoreViolationReviewResponse(
    createRequest({
      snapshots: [
        {
          id: "case-1",
          status: "submitted",
          usage_state: "testing",
          risk_level: "medium",
          admin_conclusion: "旧结论",
          suggested_action: "旧建议",
        },
      ],
    }),
    {
      getAuthenticatedContext: async () => ({
        supabase: createRestoreSupabase([]),
        user: { id: "member-1" },
      }),
      requireViolationAdmin: async () => ({
        ok: false,
        response: NextResponse.json({ error: { message: "无权限" } }, { status: 403 }),
      }),
      createAdminClient: () => createRestoreSupabase([]),
    },
  );

  assert.equal(response.status, 403);
});
