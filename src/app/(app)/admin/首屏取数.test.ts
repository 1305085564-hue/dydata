import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";

test("批改台首屏取数固定走管理员客户端", async () => {
  const mod = await import(new URL("./content/page.tsx", import.meta.url).href);

  const adminClient = { kind: "admin-content-client" };
  let adminCallCount = 0;
  let receivedArgs: unknown = null;
  const permissionScope = {
    userId: "user-1",
    role: "owner",
    businessRole: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: "team-1",
    groupId: null,
    kind: "team",
    visibleUserIds: ["user-1"],
  };

  const result = await mod.loadAdminContentInitialData("pending", { perspective: "team", teamId: "team-1" }, {
    createAdminClient: () => {
      adminCallCount += 1;
      return adminClient;
    },
    loadAdminContentPageData: async (args: unknown) => {
      receivedArgs = args;
      return { ok: true, source: "content" };
    },
  }, undefined, permissionScope as never);

  assert.equal(adminCallCount, 1);
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "pending",
    perspective: "team",
    teamId: "team-1",
    permissionInfo: undefined,
    scope: permissionScope,
  });
  assert.deepEqual(result, { ok: true, source: "content" });
});

test("批改台页面首屏观测会落到 /admin/content 路由名下", async () => {
  const mod = await import(new URL("./content/page.tsx", import.meta.url).href);
  const observations: Array<Record<string, unknown>> = [];

  await mod.recordAdminContentFirstScreenObservation({
    actorUserId: "user-1",
    scopeKind: "team",
    metrics: { auth: 12, context: 18, data: 132, total: 162 },
  }, {
    recordObservation: async (observation: Record<string, unknown>) => {
      observations.push(observation);
    },
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.route, "/admin/content");
  assert.equal(observations[0]?.statusCode, 200);
  assert.equal(observations[0]?.actorUserId, "user-1");
  assert.equal(observations[0]?.scopeKind, "team");
});

test("素材库首屏取数固定走管理员客户端", async () => {
  const mod = await import(new URL("./videos/page.tsx", import.meta.url).href);

  const adminClient = { kind: "admin-video-client" };
  let adminCallCount = 0;
  let receivedArgs: unknown = null;
  const permissionScope = {
    userId: "user-1",
    role: "owner",
    businessRole: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: null,
    groupId: null,
    kind: "all",
    visibleUserIds: ["user-1"],
  };

  const result = await mod.loadAdminVideosInitialData("all", { perspective: "company", teamId: null }, {
    createAdminClient: () => {
      adminCallCount += 1;
      return adminClient;
    },
    loadAdminVideosPageData: async (args: unknown) => {
      receivedArgs = args;
      return { ok: true, source: "videos" };
    },
  }, undefined, permissionScope as never);

  assert.equal(adminCallCount, 1);
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "all",
    perspective: "company",
    teamId: null,
    permissionInfo: undefined,
    scope: permissionScope,
  });
  assert.deepEqual(result, { ok: true, source: "videos" });
});

test("素材库页面首屏观测会落到 /admin/videos 路由名下", async () => {
  const mod = await import(new URL("./videos/page.tsx", import.meta.url).href);
  const observations: Array<Record<string, unknown>> = [];

  await mod.recordAdminVideosFirstScreenObservation({
    actorUserId: "owner-1",
    scopeKind: "all",
    metrics: { auth: 9, context: 11, data: 88, total: 108 },
  }, {
    recordObservation: async (observation: Record<string, unknown>) => {
      observations.push(observation);
    },
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.route, "/admin/videos");
  assert.equal(observations[0]?.statusCode, 200);
  assert.equal(observations[0]?.actorUserId, "owner-1");
  assert.equal(observations[0]?.scopeKind, "all");
});

test("后台首屏合同预算固定，避免候选池和阈值被随意放大", () => {
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.content.candidateLimit, 60);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.content.payloadLimit, 30);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.videos.candidateLimit, 60);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.videos.payloadLimit, 30);
});
