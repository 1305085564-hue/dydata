import test from "node:test";
import assert from "node:assert/strict";

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
