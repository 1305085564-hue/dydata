import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PERMISSIONS_BY_COMPANY_ROLE,
  PERMISSION_KEYS_FOR_GROUP_MODE,
  buildCompanyRoleProfilePatch,
  canEnterGroupMode,
  fixedPermissionsForRole,
  hasFixedPermission,
  resolveCompanyRole,
} from "@/lib/company-permissions";
import { PERMISSION_CONTRACT } from "@/lib/permission-contract";
import { DEFAULT_PERMISSIONS_BY_ROLE, PERMISSION_LABELS } from "@/types";

test("legacy owner is treated as company_owner, not a group-wide role", () => {
  assert.equal(resolveCompanyRole("owner"), "company_owner");
  assert.equal(resolveCompanyRole("admin"), "admin");
  assert.equal(resolveCompanyRole("member"), "member");
});

test("只有在职 company_owner 或迁移中的 legacy owner 可以进入集团模式", () => {
  assert.equal(canEnterGroupMode("company_owner", "active"), true);
  assert.equal(canEnterGroupMode("owner", "active"), true);
  assert.equal(canEnterGroupMode("admin", "active"), false);
  assert.equal(canEnterGroupMode("member", "active"), false);
  assert.equal(canEnterGroupMode("company_owner", "archived"), false);
});

test("固定权限忽略旧的逐人开关，并按公司角色返回真实系统设置权限", () => {
  assert.deepEqual(
    fixedPermissionsForRole("admin", { export_data: true, manage_system: true }),
    Object.fromEntries(DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.admin.map((key) => [key, true])),
  );
  assert.equal(fixedPermissionsForRole("admin", {}).export_data, true);
  assert.equal(fixedPermissionsForRole("company_owner", {}).manage_members, true);
  assert.equal(hasFixedPermission("company_owner", "manage_system"), true);
  assert.equal(hasFixedPermission("admin", "manage_system"), false);
  assert.equal(hasFixedPermission("member", "manage_system"), false);
});

test("组长默认拥有导出和成员管理，组员默认拥有个人分析和导出", () => {
  assert.equal(fixedPermissionsForRole("admin").export_data, true);
  assert.equal(fixedPermissionsForRole("admin").manage_members, true);

  const memberPermissions = fixedPermissionsForRole("member");
  assert.equal(memberPermissions.export_data, true);
  assert.equal(memberPermissions.view_analytics, true);
  assert.equal(memberPermissions.review_content, undefined);
  assert.equal(memberPermissions.manage_videos, undefined);
  assert.equal(memberPermissions.manage_fulfillment, undefined);
  assert.equal(memberPermissions.manage_members, undefined);
  assert.equal(memberPermissions.use_ai_copy, undefined);
  assert.equal(memberPermissions.use_ai_assist, undefined);
});

test("权限开关中文名与当前页面展示名一致", () => {
  assert.equal(PERMISSION_LABELS.view_analytics, "数据分析");
  assert.equal(PERMISSION_LABELS.manage_system, "系统设置");
});

test("集团模式权限集与公司所有者权限集完全一致", () => {
  const permissions = fixedPermissionsForRole("admin", {}, true);
  assert.equal(Object.keys(permissions).length, 11);
  assert.equal(permissions.manage_system, true);
  assert.deepEqual(
    [...PERMISSION_KEYS_FOR_GROUP_MODE].sort(),
    [...DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.company_owner].sort(),
  );
  assert.deepEqual(
    [...DEFAULT_PERMISSIONS_BY_ROLE.owner].sort(),
    [...DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.company_owner].sort(),
  );
  assert.deepEqual(
    [...DEFAULT_PERMISSIONS_BY_ROLE.admin].sort(),
    [...DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.admin].sort(),
  );
});

test("公司权限模块直接复用统一权限契约", () => {
  assert.strictEqual(DEFAULT_PERMISSIONS_BY_COMPANY_ROLE, PERMISSION_CONTRACT.roles);
  assert.strictEqual(PERMISSION_KEYS_FOR_GROUP_MODE, PERMISSION_CONTRACT.groupMode.permissions);
  assert.equal(PERMISSION_CONTRACT.dataScopeRules.member, "self");
  assert.equal(PERMISSION_CONTRACT.dataScopeRules.admin, "team");
  assert.equal(PERMISSION_CONTRACT.dataScopeRules.company_owner, "team");
  assert.equal(PERMISSION_CONTRACT.groupMode.dataScope, "all");
});

test("角色写入同时更新新旧角色字段", () => {
  assert.deepEqual(buildCompanyRoleProfilePatch("admin"), {
    role: "admin",
    company_role: "admin",
  });
  assert.deepEqual(buildCompanyRoleProfilePatch("member"), {
    role: "member",
    company_role: "member",
    permissions: {},
  });
});
