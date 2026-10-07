import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminModulesAccess } from "./member-access";

const baseInput = {
  currentUserId: "admin-1",
  currentUserRole: "admin" as const,
  currentUserPermissions: { manage_members: true },
  permissionManagerCapabilities: {
    canRemoveMember: true,
    canChangeRole: true,
    canEditPermissions: true,
  },
  teamManagement: { access: { canEditMembers: true } },
};

test("成员工作台访问边界：组长只能管理本团队组员，不能归档组长", () => {
  const access = resolveAdminModulesAccess({
    ...baseInput,
    currentUserCompanyRole: "admin",
    currentUserGroupMode: false,
  });

  assert.equal(access.currentCompanyRole, "admin");
  assert.equal(access.canManageLifecycle, true);
  assert.equal(access.canManageTeamStructure, false);
  assert.equal(access.canArchiveTarget({ id: "member-1", role: "member", company_role: "member" }), true);
  assert.equal(access.canArchiveTarget({ id: "admin-2", role: "admin", company_role: "admin" }), false);
  assert.equal(access.canArchiveTarget({ id: "admin-1", role: "admin", company_role: "admin" }), false);
});

test("公司所有者进入集团模式后可管理管理员，但仍不能操作自己和其他所有者", () => {
  const access = resolveAdminModulesAccess({
    ...baseInput,
    currentUserRole: "owner",
    currentUserCompanyRole: "company_owner",
    currentUserGroupMode: true,
  });

  assert.equal(access.canManageTeamStructure, true);
  assert.equal(access.canArchiveTarget({ id: "admin-2", role: "admin", company_role: "admin" }), true);
  assert.equal(access.canArchiveTarget({ id: "owner-2", role: "owner", company_role: "company_owner" }), false);
});

test("归档成员恢复入口使用快照中的原始角色，组长之间不可互相恢复", () => {
  const access = resolveAdminModulesAccess({
    ...baseInput,
    currentUserCompanyRole: "admin",
    currentUserGroupMode: false,
  });

  assert.equal(access.canArchiveTarget({
    id: "archived-admin",
    role: "member",
    company_role: "member",
    membership_status: "archived",
    archive_snapshot: { role: "admin", company_role: "admin", team_id: "team-1" },
  }), false);
});

test("角色字段冲突时拒绝成员管理，避免按不确定身份开放写入口", () => {
  const access = resolveAdminModulesAccess({
    ...baseInput,
    currentUserCompanyRole: "company_owner",
    currentUserBusinessRole: "admin",
    currentUserGroupMode: true,
  });

  assert.equal(access.currentCompanyRole, null);
  assert.equal(access.canManageMembers, false);
  assert.equal(access.canManageLifecycle, false);
});
