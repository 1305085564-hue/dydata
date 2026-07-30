import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { buildBatchReviewViolationsResponse } from "./route";

function createBatchKnowledgeSupabase(row: { id: string; status: string; admin_insight: string | null }) {
  return {
    from(table: string) {
      if (table === "violation_cases") {
        return {
          select() {
            return {
              eq() { return this; },
              async single() { return { data: null, error: { message: "not found" } }; },
            };
          },
        };
      }
      assert.equal(table, "knowledge_cases");
      return {
        select() {
          return {
            eq() { return this; },
            async single() { return { data: { ...row, deprecated_reason: null }, error: null }; },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq() { return this; },
            select() {
              return {
                async single() {
                  Object.assign(row, patch);
                  return { data: { id: row.id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("批量审核可通过 knowledge_cases", async () => {
  const row = { id: "knowledge-1", status: "submitted", admin_insight: null };
  const response = await buildBatchReviewViolationsResponse(
    new NextRequest("https://dydata.cc/api/violations/batch-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["knowledge-1"], action: "approve", conclusion: "可用" }),
    }),
    {
      getAuthenticatedContext: async () => ({ supabase: createBatchKnowledgeSupabase(row), user: { id: "admin-1" } }),
      requireViolationAdmin: async () => ({ ok: true, profile: {} }),
      createAdminClient: () => createBatchKnowledgeSupabase(row),
    } as never,
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, 1);
  assert.equal(row.status, "verified");
});
