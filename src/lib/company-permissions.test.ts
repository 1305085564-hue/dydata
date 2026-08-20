import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/types";

const companyRoleMigrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260819120000_company_role_and_group_mode.sql"),
  "utf8",
);

function sortedSqlPermissions(sql: string) {
  return [...sql.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
}

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
  assert.equal(fixedPermissionsForRole("admin", {}).export_data, undefined);
  assert.equal(fixedPermissionsForRole("company_owner", {}).manage_members, true);
  assert.equal(hasFixedPermission("company_owner", "manage_system"), true);
  assert.equal(hasFixedPermission("admin", "manage_system"), false);
  assert.equal(hasFixedPermission("member", "manage_system"), false);
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

test("代码侧公司角色权限集与未上线迁移中的 has_permission 完全一致", () => {
  const hasPermissionFunction = companyRoleMigrationSql.match(
    /create or replace function public\.has_permission\(perm text\)[\s\S]*?\$\$;/,
  )?.[0];
  assert.ok(hasPermissionFunction, "迁移中必须定义 has_permission");

  const permissionBranches = [...hasPermissionFunction.matchAll(/perm in \(([^)]*)\)/g)].map(
    (match) => match[1],
  );
  const adminPermissions = permissionBranches[0];
  const ownerPermissions = permissionBranches[1];
  assert.ok(adminPermissions, "迁移中必须定义 admin 固定权限");
  assert.ok(ownerPermissions, "迁移中必须定义 company_owner 追加权限");

  const sqlAdminPermissions = sortedSqlPermissions(adminPermissions);
  const sqlCompanyOwnerPermissions = sortedSqlPermissions(
    `${adminPermissions}, ${ownerPermissions}`,
  );

  assert.deepEqual(
    sqlAdminPermissions,
    [...DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.admin].sort(),
  );
  assert.deepEqual(
    sqlCompanyOwnerPermissions,
    [...DEFAULT_PERMISSIONS_BY_COMPANY_ROLE.company_owner].sort(),
  );
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
