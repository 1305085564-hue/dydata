import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import {
  buildVideoReviewThresholdsGetResponse,
  buildVideoReviewThresholdsPatchResponse,
  parseThresholdsPayload,
} from "./route";
import { requireSystemPermission } from "../../fulfillment/_shared";
import { fixedPermissionsForRole, runtimeRoleForCompanyRole } from "@/lib/company-permissions";

const thresholds = {
  bounce_rate_2s: 30,
  completion_rate_5s: 50,
  avg_play_duration: 30,
  completion_rate: 5,
  play_count: 1000,
};

function thresholdsAuth(companyRole: "member" | "admin" | "company_owner") {
  return {
    supabase: {
      from: () => ({
        upsert: async () => ({ error: null }),
        insert: async () => ({ error: null }),
      }),
    },
    actor: {
      userId: `${companyRole}-1`,
      role: runtimeRoleForCompanyRole(companyRole),
      companyRole,
      permissions: fixedPermissionsForRole(companyRole),
      name: null,
      dataScope: companyRole === "member" ? "self" : "team",
    },
  } as never;
}

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
    requireSystemPermission: (() => null) as never,
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
    requireSystemPermission: (() => null) as never,
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
        actor: { userId: "owner-1", role: "owner" },
      }) as never,
      requireSystemPermission: (() => null) as never,
    },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.table, "system_settings");
  assert.equal(writes[1]?.table, "audit_logs");
  assert.equal(writes[1]?.payload.action, "video_review_thresholds_updated");
});

test("阈值 PATCH 拒绝没有集团系统权限的管理员", async () => {
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
        actor: { userId: "leader-1", role: "admin" },
      }) as never,
      requireSystemPermission: () => NextResponse.json({ error: "无权限" }, { status: 403 }),
    },
  );

  assert.ok(response);
  assert.equal(response.status, 403);
});

test("阈值 PATCH 只允许公司所有者，管理员和成员收到真实的 403 响应", async () => {
  for (const [companyRole, expectedStatus] of [
    ["company_owner", 200],
    ["admin", 403],
    ["member", 403],
  ] as const) {
    const response = await buildVideoReviewThresholdsPatchResponse(
      new Request("https://dydata.cc/api/admin/settings/thresholds", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(thresholds),
      }),
      {
        createClient: (() => Promise.resolve({})) as never,
        requireAdminServiceClient: async () => thresholdsAuth(companyRole),
        requireSystemPermission,
      },
    );

    assert.ok(response);
    assert.equal(response.status, expectedStatus, companyRole);
  }
});
