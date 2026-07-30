import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { buildReviewViolationResponse } from "./review/route";

type KnowledgeCase = {
  id: string;
  status: string;
  admin_insight: string | null;
  revision_note: string | null;
  deprecated_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  revision_requested_by: string | null;
  revision_requested_at: string | null;
};

function request(body: unknown) {
  return new NextRequest("https://dydata.cc/api/violations/knowledge-1/review", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createKnowledgeReviewSupabase(row: KnowledgeCase) {
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
            async single() { return { data: { ...row }, error: null }; },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq() { return this; },
            select() {
              return {
                async single() {
                  Object.assign(row, patch);
                  return { data: { ...row }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("单条审核可通过 knowledge_cases 并保留可撤销快照", async () => {
  const row: KnowledgeCase = {
    id: "knowledge-1",
    status: "submitted",
    admin_insight: null,
    revision_note: null,
    deprecated_reason: null,
    verified_by: null,
    verified_at: null,
    revision_requested_by: null,
    revision_requested_at: null,
  };
  const response = await buildReviewViolationResponse(
    request({ status: "verified", risk_level: null, admin_conclusion: "可复用", suggested_action: null }),
    { params: Promise.resolve({ id: "knowledge-1" }) },
    {
      getAuthenticatedContext: async () => ({ supabase: createKnowledgeReviewSupabase(row), user: { id: "admin-1" } }),
      requireViolationAdmin: async () => ({ ok: true, profile: {} }),
      createAdminClient: () => createKnowledgeReviewSupabase(row),
    } as never,
  );

  assert.equal(response.status, 200);
  assert.equal(row.status, "verified");
  assert.equal(row.admin_insight, "可复用");
  assert.equal(row.verified_by, "admin-1");
  const body = await response.json();
  assert.equal(body.snapshot.source_table, "knowledge_cases");
});
