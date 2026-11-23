import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPermissionContextForActor,
  buildPermissionContextFromPermissionInfo,
  resolvePermissionIdentity,
} from "./current-permission-context";

test("统一身份核心按角色生成固定权限，并拒绝非在职账号", () => {
  const member = resolvePermissionIdentity({
    role: "member",
    company_role: "member",
    membership_status: "active",
  });
  assert.equal(member?.role, "member");
  assert.equal(member?.permissions.view_analytics, true);
  assert.equal(member?.permissions.manage_members, undefined);

  const admin = resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "active",
  });
  assert.equal(admin?.permissions.manage_members, true);
  assert.equal(admin?.permissions.manage_system, undefined);
  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "active",
  })?.permissions.manage_system, undefined);

  const owner = resolvePermissionIdentity({
    role: "owner",
    company_role: "company_owner",
    membership_status: "active",
  });
  assert.equal(owner?.companyRole, "company_owner");
  assert.equal(owner?.permissions.use_ai_assist, true);

  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: "archived",
  }), null);
  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "admin",
    membership_status: null,
  }), null);

  assert.equal(resolvePermissionIdentity({
    role: "admin",
    company_role: "company_owner",
    membership_status: "active",
  }), null, "conflicting role fields must fail closed");

  const legacyFallback = resolvePermissionIdentity({
    role: null,
    company_role: "admin",
    membership_status: "active",
  });
  assert.equal(legacyFallback?.companyRole, "admin");
  assert.equal(legacyFallback?.permissions.manage_members, true);
});

test("权限身份组合到数据范围时保留 runtime role 与 companyRole 的分离", async (t) => {
  const oldEnvId = process.env.CLOUDBASE_ENV_ID;
  const oldServiceKey = process.env.CLOUDBASE_SERVICE_API_KEY;
  process.env.CLOUDBASE_ENV_ID = "perm-test-env";
  process.env.CLOUDBASE_SERVICE_API_KEY = "test-service-key";
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
      });
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
      });

      assert.ok(context, `${profile.label} scope should resolve`);
      assert.equal(context.scope.companyRole, identity.companyRole);
      assert.equal(context.scope.role, identity.role);
      assert.equal(context.scope.kind, "team");
    }
  } finally {
    if (oldEnvId === undefined) delete process.env.CLOUDBASE_ENV_ID;
    else process.env.CLOUDBASE_ENV_ID = oldEnvId;
    if (oldServiceKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = oldServiceKey;
  }
});

test("缺少服务端配置时权限上下文构建明确失败", async () => {
  const oldKey = process.env.CLOUDBASE_SERVICE_API_KEY;
  delete process.env.CLOUDBASE_SERVICE_API_KEY;
  const info = { userId: "u1", name: null, role: "member", permissions: {}, accessLevel: null, teamId: null, groupId: null, ledGroupIds: [] };
  try {
    await assert.rejects(() => buildPermissionContextFromPermissionInfo(info as never), /Missing/);
    await assert.rejects(() => buildPermissionContextForActor({ ...info, id: undefined } as never), /Missing/);
  } finally {
    if (oldKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = oldKey;
  }
});
