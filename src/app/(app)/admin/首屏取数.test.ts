import test from "node:test";
import assert from "node:assert/strict";
import AdminPage from "./page";

test("批改台首屏取数固定走管理员客户端", async () => {
  const mod = await import(new URL("./content/content-data-container.tsx", import.meta.url).href);

  const adminClient = { kind: "admin-content-client" };
  let adminCallCount = 0;
  let receivedArgs: unknown = null;
  const permissionScope = {
    userId: "user-1",
    role: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: "team-1",
    groupId: null,
    kind: "team",
    visibleUserIds: ["user-1"],
  };

  const result = await mod.loadAdminContentInitialData({
    view: "all",
    perspective: "team",
    teamId: "team-1",
    permissionInfo: undefined,
    scope: permissionScope as never,
  }, {
    createAdminClient: () => {
      adminCallCount += 1;
      return adminClient;
    },
    loadAdminContentPageData: async (args: unknown) => {
      receivedArgs = args;
      return { ok: true, source: "content" };
    },
  } as never);

  assert.equal(adminCallCount, 1);
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "all",
    perspective: "team",
    teamId: "team-1",
    permissionInfo: undefined,
    scope: permissionScope,
  });
  assert.deepEqual(result, { ok: true, source: "content" });
});

test("/admin 页面当前固定重定向到 /admin/content", () => {
  assert.throws(
    () => AdminPage(),
    (error: unknown) => {
      assert.equal(
        (error as { digest?: string }).digest,
        "NEXT_REDIRECT;replace;/admin/content;307;",
      );
      return true;
    },
  );
});
