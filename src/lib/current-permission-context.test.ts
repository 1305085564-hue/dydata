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
