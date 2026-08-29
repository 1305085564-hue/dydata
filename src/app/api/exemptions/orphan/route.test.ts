import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import type { AdminActor } from "@/app/api/admin/auth-helper";
import { buildOrphanExemptionResponse } from "./route";

function request() {
  return new NextRequest("https://dydata.test/api/exemptions/orphan?limit=10");
}

function actor(overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    userId: "owner-1",
    role: "admin",
    companyRole: "company_owner",
    permissions: { manage_members: true, manage_fulfillment: true },
    name: "公司所有者",
    dataScope: "team",
    teamId: "team-a",
    ...overrides,
  };
}

function authResult(overrides: Partial<AdminActor> = {}) {
  return {
    supabase: { marker: "session" },
    adminSupabase: { marker: "admin" },
    actor: actor(overrides),
    scope: {
      kind: overrides.groupMode ? "all" : "team",
      teamId: overrides.teamId ?? "team-a",
      visibleUserIds: ["owner-1"],
      activeVisibleUserIds: ["owner-1"],
      groupMode: overrides.groupMode,
    },
  };
}

test("未登录访问待归属申请返回 401，且不读取数据", async () => {
  let loadCount = 0;
  const response = await buildOrphanExemptionResponse(request(), {
    requireExemptionManagerActor: async () => ({
      response: NextResponse.json({ error: "未登录" }, { status: 401 }),
    }) as never,
    loadOrphanExemptionRequests: async () => {
      loadCount += 1;
      return { data: [], count: 0 };
    },
  }) as Response;

  assert.equal(response.status, 401);
  assert.equal(loadCount, 0);
});

test("成员和普通管理员即使拥有豁免管理权限也不能读取孤立申请详情", async () => {
  for (const current of [
    { role: "member" as const, companyRole: "member" as const, permissions: {} },
    { role: "admin" as const, companyRole: "admin" as const, permissions: { manage_fulfillment: true } },
  ]) {
    const response = await buildOrphanExemptionResponse(request(), {
      requireExemptionManagerActor: async () => ({
        ...authResult(),
        actor: actor(current),
      }) as never,
      loadOrphanExemptionRequests: async () => ({ data: [], count: 0 }),
    }) as Response;

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "无权限" });
  }
});

test("公司所有者可读取团队范围内的孤立申请", async () => {
  let receivedScope: unknown;
  const response = await buildOrphanExemptionResponse(request(), {
    requireExemptionManagerActor: async () => authResult() as never,
    loadOrphanExemptionRequests: async (input) => {
      receivedScope = input.scope;
      assert.equal(input.limit, 10);
      return {
        data: [{ id: "request-a", applicant_user_id: "member-a" }],
        count: 1,
      } as never;
    },
  }) as Response;

  assert.equal(response.status, 200);
  assert.equal((receivedScope as { kind: string }).kind, "team");
  assert.deepEqual(await response.json(), {
    data: [{ id: "request-a", applicant_user_id: "member-a" }],
    count: 1,
  });
});

test("集团模式公司所有者读取时把全集团范围交给过滤层", async () => {
  let receivedScope: unknown;
  const response = await buildOrphanExemptionResponse(request(), {
    requireExemptionManagerActor: async () => authResult({ groupMode: true }) as never,
    loadOrphanExemptionRequests: async (input) => {
      receivedScope = input.scope;
      return { data: [], count: 0 };
    },
  }) as Response;

  assert.equal(response.status, 200);
  assert.equal((receivedScope as { kind: string }).kind, "all");
});

test("孤立申请查询失败只返回固定错误，不向浏览器泄露数据库细节", async (t) => {
  t.mock.method(console, "error", () => {});
  const response = await buildOrphanExemptionResponse(request(), {
    requireExemptionManagerActor: async () => authResult() as never,
    loadOrphanExemptionRequests: async () => {
      throw new Error("relation public.secret_table does not exist");
    },
  }) as Response;

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "读取待归属申请失败" });
});
