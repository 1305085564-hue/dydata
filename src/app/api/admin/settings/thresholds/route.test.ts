import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import {
  buildVideoReviewThresholdsGetResponse,
  buildVideoReviewThresholdsPatchResponse,
  parseThresholdsPayload,
} from "./route";

const thresholds = {
  bounce_rate_2s: 30,
  completion_rate_5s: 50,
  avg_play_duration: 30,
  completion_rate: 5,
  play_count: 1000,
};

test("阈值接口只接受完整且合法的配置", () => {
  const invalid = parseThresholdsPayload({ ...thresholds, completion_rate: 120 });
  assert.equal("response" in invalid && invalid.response.status, 400);

  const valid = parseThresholdsPayload(thresholds);
  assert.deepEqual("data" in valid && valid.data, thresholds);
});

test("阈值 GET 允许普通登录用户读取当前配置", async () => {
  const response = await buildVideoReviewThresholdsGetResponse({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "member-1" } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { value: thresholds }, error: null }),
          }),
        }),
      }),
    }) as never,
    requireAdminServiceClient: (() => Promise.resolve({})) as never,
    requireOwnerOrTeamAdminRole: (() => null) as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).thresholds, thresholds);
});

test("阈值 GET 在配置为空时返回默认值", async () => {
  const response = await buildVideoReviewThresholdsGetResponse({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "member-1" } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }) as never,
    requireAdminServiceClient: (() => Promise.resolve({})) as never,
    requireOwnerOrTeamAdminRole: (() => null) as never,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).thresholds.play_count, 1000);
});

test("阈值 PATCH 写配置并记录审计", async () => {
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const response = await buildVideoReviewThresholdsPatchResponse(
    new Request("https://dydata.cc/api/admin/settings/thresholds", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(thresholds),
    }),
    {
      createClient: (() => Promise.resolve({})) as never,
      requireAdminServiceClient: async () => ({
        supabase: {
          from: (table: string) => ({
            upsert: async (payload: Record<string, unknown>) => {
              writes.push({ table, payload });
              return { error: null };
            },
            insert: async (payload: Record<string, unknown>) => {
              writes.push({ table, payload });
              return { error: null };
            },
          }),
        },
        actor: { userId: "owner-1", businessRole: "owner", role: "owner" },
      }) as never,
      requireOwnerOrTeamAdminRole: (() => null) as never,
    },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.table, "system_settings");
  assert.equal(writes[1]?.table, "audit_logs");
  assert.equal(writes[1]?.payload.action, "video_review_thresholds_updated");
});

test("阈值 PATCH 拒绝 group_leader 等非 owner/team_admin 角色", async () => {
  const response = await buildVideoReviewThresholdsPatchResponse(
    new Request("https://dydata.cc/api/admin/settings/thresholds", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(thresholds),
    }),
    {
      createClient: (() => Promise.resolve({})) as never,
      requireAdminServiceClient: async () => ({
        supabase: {} as never,
        actor: { userId: "leader-1", businessRole: "group_leader", role: "admin" },
      }) as never,
      requireOwnerOrTeamAdminRole: () => NextResponse.json({ error: "无权限" }, { status: 403 }),
    },
  );

  assert.ok(response);
  assert.equal(response.status, 403);
});
