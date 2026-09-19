import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPermissionContextForActor,
  buildPermissionContextFromPermissionInfo,
  resolvePermissionIdentity,
} from "./current-permission-context";

test("统一身份核心按角色和集团状态生成固定权限，并拒绝非在职账号", () => {
  const member = resolvePermissionIdentity({
    role: "member",
    company_role: "member",
    membership_status: "active",
  }, false);
  assert.equal(member?.role, "member");
  assert.equal(member?.permissions.view_analytics, true);
  assert.equal(member?.permissions.manage_members, undefined);

  const admin = resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "active",
  }, false);
  assert.equal(admin?.permissions.manage_members, true);
  assert.equal(admin?.permissions.manage_system, undefined);
  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "active",
  }, true)?.permissions.manage_system, undefined);

  const ownerGroupMode = resolvePermissionIdentity({
    role: "owner",
    company_role: "company_owner",
    membership_status: "active",
  }, true);
  assert.equal(ownerGroupMode?.companyRole, "company_owner");
  assert.equal(ownerGroupMode?.permissions.use_ai_assist, true);

  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "archived",
  }, false), null);
  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: null,
  }, false), null);

  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "company_owner",
    membership_status: "active",
  }, false), null, "conflicting role fields must fail closed");

  const legacyFallback = resolvePermissionIdentity({
    role: null,
    company_role: "admin",
    membership_status: "active",
  }, false);
  assert.equal(legacyFallback?.companyRole, "admin");
  assert.equal(legacyFallback?.permissions.manage_members, true);
});

test("权限身份组合到数据范围时保留 runtime role 与 companyRole 的分离", async (t) => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  t.mock.method(globalThis, "fetch", async () => Response.json([]));

  const cases = [
    { label: "company_owner", role: "owner", company_role: "company_owner" },
    { label: "admin", role: "admin", company_role: "admin" },
    { label: "legacy owner", role: "owner", company_role: undefined },
  ] as const;

  try {
    for (const profile of cases) {
      const identity = resolvePermissionIdentity({
        role: profile.role,
        company_role: profile.company_role,
        membership_status: "active",
      }, false);
      assert.ok(identity, `${profile.label} identity should resolve`);

      const context = await buildPermissionContextFromPermissionInfo({
        userId: `${profile.label}-user`,
        name: null,
        role: identity.role,
        permissions: identity.permissions,
        dataScope: "team",
        teamId: "team-A",
        companyRole: identity.companyRole,
        membershipStatus: "active",
        groupMode: false,
      });

      assert.ok(context, `${profile.label} scope should resolve`);
      assert.equal(context.scope.companyRole, identity.companyRole);
      assert.equal(context.scope.role, identity.role);
      assert.equal(context.scope.kind, "team");
    }
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceRoleKey;
  }
});

test("缺少服务端配置时权限上下文构建明确失败", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const info = { userId: "u1", name: null, role: "member", permissions: {}, accessLevel: null, teamId: null, groupId: null, ledGroupIds: [] };
  try {
    await assert.rejects(() => buildPermissionContextFromPermissionInfo(info as never), /Missing/);
    await assert.rejects(() => buildPermissionContextForActor({ ...info, id: undefined } as never), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
