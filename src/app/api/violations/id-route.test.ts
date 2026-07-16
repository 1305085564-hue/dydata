import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import {
  buildDeleteViolationResponse,
  buildPatchViolationResponse,
} from "./id-route-helpers";

type CaseRow = {
  id: string;
  status: string;
  is_deleted?: boolean;
  script_text?: string;
  source_script_text?: string;
  usage_state?: string | null;
  risk_level?: string | null;
  admin_conclusion?: string | null;
  suggested_action?: string | null;
  deprecated_reason?: string | null;
};

function createRequest(method = "DELETE", body?: unknown) {
  return new NextRequest("https://dydata.cc/api/violations/case-1", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function createDeleteSupabase(input: {
  violationCases?: CaseRow[];
  knowledgeCases?: CaseRow[];
}) {
  const violationCases = input.violationCases ?? [];
  const knowledgeCases = input.knowledgeCases ?? [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

  return {
    updates,
    from(table: string) {
      let pendingId: string | null = null;
      let pendingDeleted: boolean | null = null;
      let pendingStatus: string | null = null;
      const rows = table === "violation_cases" ? violationCases : knowledgeCases;

      const findTarget = () =>
        rows.find((row) =>
          row.id === pendingId
          && (pendingDeleted === null || row.is_deleted === pendingDeleted)
          && (pendingStatus === null || row.status === pendingStatus),
        );

      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              if (column === "status") pendingStatus = String(value);
              return this;
            },
            async single() {
              const target = findTarget();
              if (!target) {
                return { data: null, error: { message: "not found" } };
              }
              return { data: { ...target }, error: null };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          return {
            eq(column: string, value: unknown) {
              if (column === "id") pendingId = String(value);
              if (column === "is_deleted") pendingDeleted = Boolean(value);
              if (column === "status") pendingStatus = String(value);
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

test("DELETE 管理员下架 violation_cases 已发布话术", async () => {
  const supabase = createDeleteSupabase({
    violationCases: [{
      id: "case-1",
      status: "verified",
      is_deleted: false,
      usage_state: "available",
      risk_level: "high",
      admin_conclusion: "旧结论",
      suggested_action: "旧建议",
    }],
  });

  const response = await buildDeleteViolationResponse(createRequest(), {
    params: Promise.resolve({ id: "case-1" }),
  }, {
    getAuthenticatedContext: async () => ({
      supabase,
      user: { id: "owner-1" },
    }),
    requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(supabase.updates[0], {
    table: "violation_cases",
    payload: { is_deleted: true, status: "archived" },
  });
  assert.deepEqual(await response.json(), {
    ok: true,
    snapshot: {
      source_table: "violation_cases",
      id: "case-1",
      status: "verified",
      is_deleted: false,
      usage_state: "available",
      risk_level: "high",
      admin_conclusion: "旧结论",
      suggested_action: "旧建议",
    },
  });
});

test("DELETE 管理员在 violation_cases miss 后下架 knowledge_cases 已发布话术", async () => {
  const supabase = createDeleteSupabase({
    knowledgeCases: [{ id: "case-1", status: "verified" }],
  });

  const response = await buildDeleteViolationResponse(createRequest(), {
    params: Promise.resolve({ id: "case-1" }),
  }, {
    getAuthenticatedContext: async () => ({
      supabase,
      user: { id: "owner-1" },
    }),
    requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(supabase.updates, [
    {
      table: "knowledge_cases",
      payload: { status: "deprecated", deprecated_reason: "admin_deleted" },
    },
  ]);
  assert.deepEqual(await response.json(), {
    ok: true,
    snapshot: {
      source_table: "knowledge_cases",
      id: "case-1",
      status: "verified",
      deprecated_reason: null,
    },
  });
});

test("PATCH 管理员可更新 violation_cases 已发布话术正文", async () => {
  const supabase = createDeleteSupabase({
    violationCases: [{
      id: "case-1",
      status: "verified",
      is_deleted: false,
      script_text: "旧话术",
    }],
  });

  const response = await buildPatchViolationResponse(createRequest("PATCH", {
    script_text: "  新话术  ",
  }), {
    params: Promise.resolve({ id: "case-1" }),
  }, {
    getAuthenticatedContext: async () => ({
      supabase,
      user: { id: "owner-1" },
    }),
    requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
  });

  assert.equal(response.status, 200);
  assert.equal(supabase.updates[0]?.table, "violation_cases");
  assert.deepEqual(supabase.updates[0]?.payload, { script_text: "新话术" });
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      source_table: "violation_cases",
      id: "case-1",
      script_text: "新话术",
    },
  });
});

test("PATCH 管理员在 violation_cases miss 后更新 knowledge_cases 正文", async () => {
  const supabase = createDeleteSupabase({
    knowledgeCases: [{
      id: "case-1",
      status: "verified",
      source_script_text: "旧高转化话术",
    }],
  });

  const response = await buildPatchViolationResponse(createRequest("PATCH", {
    script_text: "新高转化话术",
  }), {
    params: Promise.resolve({ id: "case-1" }),
  }, {
    getAuthenticatedContext: async () => ({
      supabase,
      user: { id: "owner-1" },
    }),
    requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(supabase.updates, [
    {
      table: "violation_cases",
      payload: { script_text: "新高转化话术" },
    },
    {
      table: "knowledge_cases",
      payload: { source_script_text: "新高转化话术" },
    },
  ]);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      source_table: "knowledge_cases",
      id: "case-1",
      script_text: "新高转化话术",
    },
  });
});
