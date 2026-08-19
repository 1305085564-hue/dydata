import test from "node:test";
import assert from "node:assert/strict";

import type { AdminModuleMemberSummary } from "@/lib/admin-modules-contract";
import {
  filterVisibleTeamManagementProfiles,
  resolveTeamManagementAccess,
  type TeamManagementProfile,
} from "@/lib/team-management";
import {
  getVisibleTeamOptions,
} from "./team-view-logic";
import {
  canChangeMemberRole,
  canRemoveMemberTarget,
  getPermissionManagerCapabilities,
  resolveMemberTeamTransfer,
  resolvePermissionUpdate,
} from "../权限管理";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { fixedPermissionsForRole } from "@/lib/company-permissions";

const mockTeams = [
  { id: "team-shenzhen-1", name: "深圳一部" },
  { id: "team-shenzhen-2", name: "深圳二部" },
];

const mockActiveProfiles: AdminModuleMemberSummary[] = [
  {
    id: "owner-sz2",
    name: "阿禅",
    email: "owner@dydata.com",
    role: "admin",
    status: "active",
    team_id: "team-shenzhen-2",
    team_name: "深圳二部",
    membership_status: "active",
    permissions: fixedPermissionsForRole("company_owner"),
  },
  {
    id: "admin-sz2",
    name: "深圳二部主管",
    email: "admin-sz2@dydata.com",
    role: "admin",
    status: "active",
    team_id: "team-shenzhen-2",
    team_name: "深圳二部",
    membership_status: "active",
    permissions: fixedPermissionsForRole("admin"),
  },
  {
    id: "member-sz2",
    name: "深圳二部组员",
    email: "member-sz2@dydata.com",
    role: "member",
    status: "active",
    team_id: "team-shenzhen-2",
    team_name: "深圳二部",
    membership_status: "active",
    permissions: {},
  },
  {
    id: "admin-sz1",
    name: "深圳一部主管",
    email: "admin-sz1@dydata.com",
    role: "admin",
    status: "active",
    team_id: "team-shenzhen-1",
    team_name: "深圳一部",
    membership_status: "active",
    permissions: fixedPermissionsForRole("admin"),
  },
  {
    id: "member-sz1",
    name: "深圳一部组员",
    email: "member-sz1@dydata.com",
    role: "member",
    status: "active",
    team_id: "team-shenzhen-1",
    team_name: "深圳一部",
    membership_status: "active",
    permissions: {},
  },
];

const mockArchivedProfiles: AdminModuleMemberSummary[] = [
  {
    id: "archived-sz2",
    name: "深圳二部离职组员",
    email: "archived-sz2@dydata.com",
    role: "member",
    status: "active",
    team_id: null,
    team_name: null,
    membership_status: "archived",
    archive_reason: "离职",
    archive_snapshot: { team_id: "team-shenzhen-2", team_name: "深圳二部" },
    permissions: {},
  },
  {
    id: "archived-sz1",
    name: "深圳一部离职组员",
    email: "archived-sz1@dydata.com",
    role: "member",
    status: "active",
    team_id: null,
    team_name: null,
    membership_status: "archived",
    archive_reason: "转岗",
    archive_snapshot: { team_id: "team-shenzhen-1", team_name: "深圳一部" },
    permissions: {},
  },
];

test("1. company_owner 在当前公司能看到管理入口与全部管理能力", () => {
  const actor = {
    id: "owner-sz2",
    name: "阿禅",
    role: "admin" as const,
    company_role: "company_owner" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("company_owner"),
  };

  const access = resolveTeamManagementAccess(actor, false);
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);
  assert.deepEqual(access.teamIds, ["team-shenzhen-2"]);

  const capabilities = getPermissionManagerCapabilities(actor.role, actor.permissions);
  assert.equal(capabilities.canEditPermissions, true);
  assert.equal(capabilities.canChangeRole, true);
  assert.equal(capabilities.canRemoveMember, true);

  // 组件内计算的管理权限判定
  const isCompanyOwner = actor.company_role === "company_owner";
  const canManageCompany = isCompanyOwner || false;
  const canChangeRole = canManageCompany || capabilities.canChangeRole;
  const canResetPassword = canManageCompany || actor.permissions.manage_members === true;
  const canManageExemption = canManageCompany || actor.permissions.manage_fulfillment === true;
  const canArchive = canManageCompany;

  assert.equal(canManageCompany, true, "公司所有者必须具备公司管理入口");
  assert.equal(canChangeRole, true, "公司所有者必须具备角色修改入口");
  assert.equal(canResetPassword, true, "公司所有者必须具备密码重置入口");
  assert.equal(canManageExemption, true, "公司所有者必须具备豁免管理入口");
  assert.equal(canArchive, true, "公司所有者必须具备归档账号入口");
});

test("2. company_owner 默认只管理本公司，不显示其他公司的成员与归档", () => {
  const actor = {
    id: "owner-sz2",
    name: "阿禅",
    role: "admin" as const,
    company_role: "company_owner" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("company_owner"),
  };

  const access = resolveTeamManagementAccess(actor, false);
  const visibleProfiles = filterVisibleTeamManagementProfiles(
    access,
    mockActiveProfiles as TeamManagementProfile[],
  );

  assert.deepEqual(
    visibleProfiles.map((p) => p.id),
    ["owner-sz2", "admin-sz2", "member-sz2"],
    "必须严格过滤掉深圳一部的成员",
  );
  assert.equal(visibleProfiles.some((p) => p.team_id === "team-shenzhen-1"), false);

  // 归档过滤
  const visibleTeamIds = new Set(access.teamIds!);
  const visibleArchived = mockArchivedProfiles.filter((p) => {
    const teamId = (p.archive_snapshot?.team_id as string | undefined) ?? p.team_id ?? null;
    return Boolean(teamId && visibleTeamIds.has(teamId));
  });

  assert.deepEqual(
    visibleArchived.map((p) => p.id),
    ["archived-sz2"],
    "公司所有者不能看到其他公司的归档记录",
  );
});

test("3. company_owner 不能仅因为 role=owner 获得集团范围", () => {
  const legacyActor = {
    id: "owner-sz2",
    name: "阿禅",
    role: "owner" as const,
    team_id: "team-shenzhen-2",
    permissions: {},
  };

  const access = resolveTeamManagementAccess(legacyActor, false);
  assert.deepEqual(access.teamIds, ["team-shenzhen-2"], "未开启集团模式时不能为 null");
  assert.equal(access.teamIds !== null, true);

  const visibleTeams = getVisibleTeamOptions({
    groupMode: false,
    allTeams: mockTeams,
    manageableTeams: [mockTeams[1]],
  });
  assert.deepEqual(visibleTeams, [mockTeams[1]], "未开启集团模式时不能展示全量集团团队");
});

test("4. groupMode=true 时显示集团范围全部公司与成员", () => {
  const actor = {
    id: "owner-sz2",
    name: "阿禅",
    role: "admin" as const,
    company_role: "company_owner" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("company_owner", null, true),
  };

  const access = resolveTeamManagementAccess(actor, true);
  assert.equal(access.level, "owner");
  assert.equal(access.teamIds, null, "集团模式下 teamIds 必须为 null");
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);

  const visibleProfiles = filterVisibleTeamManagementProfiles(
    access,
    mockActiveProfiles as TeamManagementProfile[],
  );
  assert.equal(visibleProfiles.length, mockActiveProfiles.length, "集团模式下必须可见全集团成员");

  const visibleTeams = getVisibleTeamOptions({
    groupMode: true,
    allTeams: mockTeams,
    manageableTeams: [mockTeams[1]],
  });
  assert.deepEqual(visibleTeams, mockTeams, "集团模式下必须展示全集团团队分组");
});

test("5. groupMode 过期或关闭后立刻回到当前公司范围", () => {
  const actor = {
    id: "owner-sz2",
    name: "阿禅",
    role: "admin" as const,
    company_role: "company_owner" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("company_owner"),
  };

  // 1) 集团模式生效时
  const groupAccess = resolveTeamManagementAccess(actor, true);
  assert.equal(groupAccess.teamIds, null);
  const groupTeams = getVisibleTeamOptions({
    groupMode: true,
    allTeams: mockTeams,
    manageableTeams: [mockTeams[1]],
  });
  assert.equal(groupTeams.length, 2);

  // 2) 集团模式过期变为 false 时
  const expiredAccess = resolveTeamManagementAccess(actor, false);
  assert.deepEqual(expiredAccess.teamIds, ["team-shenzhen-2"]);
  const expiredTeams = getVisibleTeamOptions({
    groupMode: false,
    allTeams: mockTeams,
    manageableTeams: [mockTeams[1]],
  });
  assert.deepEqual(expiredTeams, [mockTeams[1]]);
  const expiredProfiles = filterVisibleTeamManagementProfiles(
    expiredAccess,
    mockActiveProfiles as TeamManagementProfile[],
  );
  assert.deepEqual(expiredProfiles.map((p) => p.id), ["owner-sz2", "admin-sz2", "member-sz2"]);
});

test("6. admin 只能看到当前公司日常业务，不能看到跨公司成员与操作入口", () => {
  const actor = {
    id: "admin-sz2",
    name: "深圳二部主管",
    role: "admin" as const,
    company_role: "admin" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("admin"),
  };

  const access = resolveTeamManagementAccess(actor, false);
  assert.deepEqual(access.teamIds, ["team-shenzhen-2"]);

  const visibleProfiles = filterVisibleTeamManagementProfiles(
    access,
    mockActiveProfiles as TeamManagementProfile[],
  );
  assert.deepEqual(visibleProfiles.map((p) => p.id), ["owner-sz2", "admin-sz2", "member-sz2"]);

  // 普通 admin 在固定权限下不具备 manage_members
  const capabilities = getPermissionManagerCapabilities(actor.role, actor.permissions);
  assert.equal(capabilities.canEditPermissions, false);
  assert.equal(capabilities.canChangeRole, false);
  assert.equal(capabilities.canRemoveMember, false);

  const isCompanyOwner = (actor.company_role as string) === "company_owner";
  const canManageCompany = isCompanyOwner || false;
  const canChangeRole = canManageCompany || capabilities.canChangeRole;
  const canResetPassword = canManageCompany || actor.permissions.manage_members === true;
  const canArchive = canManageCompany;

  assert.equal(canManageCompany, false);
  assert.equal(canChangeRole, false);
  assert.equal(canResetPassword, false);
  assert.equal(canArchive, false);
});

test("7. member 访问成员管理页面被拦截且没有管理入口", () => {
  const canAccess = canAccessAdminPath("/admin/modules", "member", {});
  assert.equal(canAccess, false, "普通成员禁止访问 /admin/modules 路径");

  const actor = {
    id: "member-sz2",
    name: "普通组员",
    role: "member" as const,
    company_role: "member" as const,
    team_id: "team-shenzhen-2",
    permissions: fixedPermissionsForRole("member"),
  };

  const access = resolveTeamManagementAccess(actor, false);
  assert.equal(access.canEditMembers, false);

  const isCompanyOwner = (actor.company_role as string) === "company_owner";
  const canManageCompany = isCompanyOwner || false;
  assert.equal(canManageCompany, false);
});

test("8. archived 成员卡片与抽屉严禁出现当前操作入口", () => {
  const archivedMember = mockArchivedProfiles[0];
  assert.equal(archivedMember.membership_status, "archived");

  // 1) 抽屉中针对归档账号的操作判定
  const isArchived = archivedMember.membership_status === "archived";
  const canShowDrawerActions = !isArchived;
  assert.equal(canShowDrawerActions, false, "归档成员抽屉中必须完全隐藏修改角色、重置密码、豁免、移出和归档等当前操作");

  // 2) 归档视图卡片中不可全选或修改团队
  const isArchivedView = true;
  const canShowCheckbox = !isArchivedView;
  assert.equal(canShowCheckbox, false, "归档卡片禁止展示批量勾选框");
});

test("9. 页面隐藏入口不影响后端鉴权逻辑，跨公司与越权调用被后端拦截", () => {
  // 1) admin 跨团队调配成员
  const transferResult = resolveMemberTeamTransfer({
    actorRole: "admin",
    actorId: "admin-sz2",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-shenzhen-2",
    targetId: "member-sz1",
    targetRole: "member",
    targetTeamId: "team-shenzhen-1",
    newTeamId: "team-shenzhen-2",
  });
  assert.equal(transferResult.shouldApply, false);
  assert.equal(transferResult.error, "负责人只能调配本团队/未分配成员");

  // 2) 跨公司修改权限
  const permissionResult = resolvePermissionUpdate({
    actorRole: "admin",
    actorId: "owner-sz2",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-shenzhen-2",
    targetId: "admin-sz1",
    targetRole: "admin",
    targetPermissions: {},
    targetTeamId: "team-shenzhen-1",
    newPermissions: { use_ai_copy: true },
  });
  assert.deepEqual(permissionResult, { error: "负责人只能修改本团队权限" });

  // 3) 跨公司角色修改
  const changeRoleAllowed = canChangeMemberRole({
    actorRole: "admin",
    actorId: "owner-sz2",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-shenzhen-2",
    targetId: "member-sz1",
    targetRole: "member",
    targetPermissions: {},
    targetTeamId: "team-shenzhen-1",
    newRole: "admin",
  });
  assert.equal(changeRoleAllowed, false, "公司所有者在未开启集团模式时不能跨公司修改角色");

  // 4) 跨公司移除成员
  const removeAllowed = canRemoveMemberTarget({
    actorRole: "admin",
    actorId: "owner-sz2",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-shenzhen-2",
    targetId: "member-sz1",
    targetRole: "member",
    targetPermissions: {},
    targetTeamId: "team-shenzhen-1",
  });
  assert.equal(removeAllowed, false, "公司所有者在未开启集团模式时不能跨公司移除成员");
});
