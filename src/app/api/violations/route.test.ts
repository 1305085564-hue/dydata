import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildCreateViolationResponse } from "./create-route-helpers";

function createRequest(body: unknown) {
  return new NextRequest("https://dydata.cc/api/violations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createInsertSupabase() {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  return {
    inserts,
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return {
            select() {
              return {
                async single() {
                  return {
                    data: { id: `${table}-1`, ...payload },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("POST 高转化话术直接写入 knowledge_cases submitted", async () => {
  const supabase = createInsertSupabase();

  const response = await buildCreateViolationResponse(
    createRequest({
      script_text: "高转化开场话术",
      is_violation: false,
      category: "直播",
      account_id: "account-1",
      scene_description: "开场 3 秒",
      screenshot_paths: ["user-1/case.png"],
      result: "转化好",
      tags: ["高转化"],
      platforms: ["抖音", "小红书"],
    }),
    {
      getAuthenticatedContext: async () => ({
        supabase,
        user: { id: "user-1" },
      }),
      getUserProfile: async () => ({
        id: "user-1",
        role: "member",
        businessRole: "member",
        permissions: {},
        team_id: "team-1",
      }),
      getOwnedAccount: async () => ({
        ok: true,
        account: {
          id: "account-1",
          name: "账号 A",
          profile_id: "user-1",
        },
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(supabase.inserts.length, 1);
  assert.equal(supabase.inserts[0]?.table, "knowledge_cases");
  assert.equal(supabase.inserts[0]?.payload.submitted_by, "user-1");
  assert.equal(supabase.inserts[0]?.payload.team_id, "team-1");
  assert.equal(supabase.inserts[0]?.payload.source_script_text, "高转化开场话术");
  assert.equal(supabase.inserts[0]?.payload.source_notes, "开场 3 秒");
  assert.deepEqual(supabase.inserts[0]?.payload.screenshot_paths, ["user-1/case.png"]);
  assert.equal(supabase.inserts[0]?.payload.status, "submitted");
  assert.deepEqual(supabase.inserts[0]?.payload.source_payload, {
    category: "直播",
    result: "转化好",
    tags: ["高转化"],
    platforms: ["抖音", "小红书"],
    is_violation: false,
  });
});

test("POST 违规话术仍写入 violation_cases", async () => {
  const supabase = createInsertSupabase();

  const response = await buildCreateViolationResponse(
    createRequest({
      script_text: "违规话术",
      is_violation: true,
      category: "直播",
      account_id: null,
      screenshot_paths: ["user-1/case.png"],
    }),
    {
      getAuthenticatedContext: async () => ({
        supabase,
        user: { id: "user-1" },
      }),
      getUserProfile: async () => ({
        id: "user-1",
        role: "member",
        businessRole: "member",
        permissions: {},
        team_id: "team-1",
      }),
      getOwnedAccount: async () => ({
        ok: true,
        account: null,
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(supabase.inserts.length, 1);
  assert.equal(supabase.inserts[0]?.table, "violation_cases");
  assert.equal(supabase.inserts[0]?.payload.purpose, "violation");
});
