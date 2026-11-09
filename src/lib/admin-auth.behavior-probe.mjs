import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before, mock } from "node:test";

let userContext = { user: { id: "user-1" }, authError: null };
let coreValue = null;

function mockFile(relativePath, namedExports) {
  mock.module(pathToFileURL(resolve(process.cwd(), relativePath)).href, { namedExports });
}

let requireAdminContext;
let requireAdminActor;

before(async () => {
  mockFile("src/lib/current-user-context.ts", {
    getCurrentUserContext: async () => userContext,
  });
  mockFile("src/lib/current-permission-context.ts", {
    resolvePermissionCore: async () => coreValue,
    permissionInfoFromCore: (core) => ({
      userId: core.userId,
      name: core.name,
      role: core.role,
      permissions: core.permissions,
      dataScope: core.dataScope,
      teamId: core.teamId,
    }),
  });
  ({ requireAdminContext, requireAdminActor } = await import("./admin-auth.ts"));
});

function core(overrides = {}) {
  return {
    userId: "user-1",
    name: "成员甲",
    role: "member",
    companyRole: "member",
    membershipStatus: "active",
    dataScope: "self",
    teamId: "team-1",
    permissions: { review_content: true },
    scope: { kind: "self", visibleUserIds: ["user-1"], activeVisibleUserIds: ["user-1"] },
    supabase: { tag: "supabase" },
    ...overrides,
  };
}

test("未登录或读取身份失败时统一返回 401 未登录", async () => {
  userContext = { user: null, authError: null };
  assert.deepEqual(await requireAdminContext(), { error: "未登录", status: 401 });

  userContext = { user: { id: "user-1" }, authError: new Error("auth down") };
  assert.deepEqual(await requireAdminContext(), { error: "未登录", status: 401 });
});

test("权限上下文解析失败时返回 403 无权限", async () => {
  userContext = { user: { id: "user-1" }, authError: null };
  coreValue = null;
  assert.deepEqual(await requireAdminContext(), { error: "无权限", status: 403 });
});

test("指定权限未授予时 403；授予时放行并返回同一份权限与范围", async () => {
  coreValue = core({ permissions: { review_content: false, manage_system: true } });
  assert.deepEqual(await requireAdminContext({ requiredPermission: "review_content" }), { error: "无权限", status: 403 });

  const allowed = await requireAdminContext({ requiredPermission: "manage_system" });
  assert.equal(allowed.actor.userId, "user-1");
  assert.equal(allowed.actor.permissions.manage_system, true);
  assert.equal(allowed.supabase, coreValue.supabase);
  assert.deepEqual(allowed.context.scope, coreValue.scope);
  assert.equal(allowed.actor.activeVisibleUserIds[0], "user-1");
});

test("不指定权限时，只要有一个权限为真即放行；全为假则拒绝", async () => {
  coreValue = core({ permissions: { a: false, b: false } });
  assert.deepEqual(await requireAdminContext(), { error: "无权限", status: 403 });

  coreValue = core({ permissions: { a: false, b: true } });
  const allowed = await requireAdminContext();
  assert.equal("error" in allowed, false);
});

test("requireAdminActor 与 requireAdminContext 使用同一判定，不出现两套口径", async () => {
  coreValue = core({ permissions: {} });
  assert.deepEqual(await requireAdminActor(), { error: "无权限", status: 403 });

  coreValue = core({ permissions: { review_content: true } });
  const actor = await requireAdminActor({ requiredPermission: "review_content" });
  assert.equal(actor.actor.userId, "user-1");
  assert.equal(actor.actor.role, "member");
});
