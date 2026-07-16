import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildReviewViolationResponse } from "./route";

type CaseRow = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
  promotion_level?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  highlighted_sections?: unknown[];
  is_deleted: boolean;
};

function createRequest(body: unknown) {
  return new NextRequest("https://dydata.cc/api/violations/case-1/review", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createReviewSupabase(rows: CaseRow[]) {
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
                  risk_level: target.risk_level,
                  admin_conclusion: target.admin_conclusion,
                  suggested_action: target.suggested_action,
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
            select(query: string) {
              assert.equal(query, "*");
              return {
                async single() {
                  const target = findTarget();
                  if (!target) {
                    return { data: null, error: { message: "not found" } };
                  }
                  Object.assign(target, payload);
                  return { data: { ...target }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("review response 包含 update 前的完整 snapshot", async () => {
  const rows: CaseRow[] = [
    {
      id: "case-1",
      status: "submitted",
      usage_state: "testing",
      risk_level: "medium",
      admin_conclusion: "旧结论",
      suggested_action: "旧建议",
      promotion_level: "normal",
      is_deleted: false,
    },
  ];

  const response = await buildReviewViolationResponse(
    createRequest({
      status: "verified",
      risk_level: "high",
      usage_state: "available",
      admin_conclusion: "新结论",
      suggested_action: "新建议",
    }),
    { params: Promise.resolve({ id: "case-1" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createReviewSupabase(rows),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createReviewSupabase(rows),
    },
  );

  assert.equal(response.status, 200);

  const json = await response.json();
  assert.deepEqual(json.snapshot, {
    id: "case-1",
    status: "submitted",
    usage_state: "testing",
    risk_level: "medium",
    admin_conclusion: "旧结论",
    suggested_action: "旧建议",
  });

  assert.equal(json.data.id, "case-1");
  assert.equal(json.data.status, "verified");
  assert.equal(json.data.usage_state, "available");
  assert.equal(json.data.risk_level, "high");
  assert.equal(json.data.admin_conclusion, "新结论");
  assert.equal(json.data.suggested_action, "新建议");
  assert.equal(rows[0].status, "verified");
  assert.equal(rows[0].usage_state, "available");
});

test("管理员审核时可保存违规段落标注", async () => {
  const rows: CaseRow[] = [{
    id: "case-1",
    status: "submitted",
    usage_state: "testing",
    risk_level: null,
    admin_conclusion: null,
    suggested_action: null,
    highlighted_sections: [],
    is_deleted: false,
  }];

  const response = await buildReviewViolationResponse(
    createRequest({
      status: "verified",
      highlighted_sections: [{ start: 12, end: 28, text: "疑似引流", reason: "联系方式外露" }],
    }),
    { params: Promise.resolve({ id: "case-1" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createReviewSupabase(rows),
        user: { id: "owner-1" },
      }),
      requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
      createAdminClient: () => createReviewSupabase(rows),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(rows[0].highlighted_sections?.length, 1);
  assert.deepEqual(rows[0].highlighted_sections?.[0], {
    start: 12,
    end: 28,
    text: "疑似引流",
    reason: "联系方式外露",
    created_at: (rows[0].highlighted_sections?.[0] as { created_at?: string }).created_at,
  });
  assert.equal(
    typeof (rows[0].highlighted_sections?.[0] as { created_at?: unknown }).created_at,
    "string",
  );
});

test("普通员工不能通过审核接口写入违规段落标注", async () => {
  const rows: CaseRow[] = [{
    id: "case-1",
    status: "submitted",
    usage_state: "testing",
    risk_level: null,
    admin_conclusion: null,
    suggested_action: null,
    highlighted_sections: [],
    is_deleted: false,
  }];

  const response = await buildReviewViolationResponse(
    createRequest({
      status: "verified",
      highlighted_sections: [{ start: 0, end: 4, text: "违规段落" }],
    }),
    { params: Promise.resolve({ id: "case-1" }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: createReviewSupabase(rows),
        user: { id: "member-1" },
      }),
      requireViolationAdmin: async () => ({
        ok: false,
        response: new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }),
      }),
    },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(rows[0].highlighted_sections, []);
});
