import assert from "node:assert/strict";
import test from "node:test";

import {
  canManagePermissionsForTarget,
  getBusinessScopeKind,
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessGroup,
  type BusinessProfile,
} from "./business-role";

const groups: BusinessGroup[] = [
  { id: "group-1", team_id: "team-1", leader_user_id: "leader-1" },
  { id: "group-2", team_id: "team-2", leader_user_id: "leader-2" },
];

test("业务身份会从三级 role 派生为四级", () => {
  assert.equal(resolveBusinessRole({ id: "owner-1", role: "owner" }, groups), "owner");
  assert.equal(
    resolveBusinessRole(
      { id: "manager-1", role: "admin", permissions: { manage_members: true }, team_id: "team-1" },
      groups,
    ),
    "team_admin",
  );
  assert.equal(resolveBusinessRole({ id: "leader-1", role: "admin", permissions: {}, team_id: "team-1" }, groups), "group_leader");
  assert.equal(resolveBusinessRole({ id: "member-1", role: "member", permissions: {}, team_id: "team-1" }, groups), "member");
});

test("四级身份对应固定数据范围", () => {
  assert.equal(getBusinessScopeKind("owner"), "global");
  assert.equal(getBusinessScopeKind("team_admin"), "team");
  assert.equal(getBusinessScopeKind("group_leader"), "group");
  assert.equal(getBusinessScopeKind("member"), "self");
});

test("负责人默认拥有团队管理和 AI 管理能力，显式 false 会保留", () => {
  const permissions = normalizePermissionsForBusinessRole("team_admin", {
    use_ai_management: false,
  });

  assert.equal(permissions.manage_members, true);
  assert.equal(permissions.view_all_data, true);
  assert.equal(permissions.use_ai_copywriting, true);
  assert.equal(permissions.use_ai_management, false);
});

test("组长默认拥有运营内容和数据能力，但不能管理权限", () => {
  const permissions = normalizePermissionsForBusinessRole("group_leader", {});

  assert.equal(permissions.view_analytics, true);
  assert.equal(permissions.view_content_review, true);
  assert.equal(permissions.review_diagnosis, true);
  assert.equal(permissions.export_data, true);
  assert.equal(permissions.use_ai_copywriting, true);
  assert.equal(permissions.manage_members, false);
  assert.equal(permissions.use_ai_management, false);
});

test("组员默认无权限，被授予后才拥有", () => {
  const permissions = normalizePermissionsForBusinessRole("member", {
    use_ai_copywriting: true,
  });

  assert.equal(permissions.view_analytics, false);
  assert.equal(permissions.manage_members, false);
  assert.equal(permissions.use_ai_copywriting, true);
});

test("负责人只能在本团队内分配权限，owner 可跨团队", () => {
  const owner: BusinessProfile = { id: "owner-1", role: "owner" };
  const manager: BusinessProfile = {
    id: "manager-1",
    role: "admin",
    permissions: { manage_members: true },
    team_id: "team-1",
  };
  const sameTeamMember: BusinessProfile = { id: "member-1", role: "member", team_id: "team-1" };
  const otherTeamMember: BusinessProfile = { id: "member-2", role: "member", team_id: "team-2" };
  const leader: BusinessProfile = { id: "leader-1", role: "admin", team_id: "team-1" };

  assert.equal(canManagePermissionsForTarget(owner, sameTeamMember, groups), true);
  assert.equal(canManagePermissionsForTarget(manager, sameTeamMember, groups), true);
  assert.equal(canManagePermissionsForTarget(manager, leader, groups), true);
  assert.equal(canManagePermissionsForTarget(manager, otherTeamMember, groups), false);
  assert.equal(canManagePermissionsForTarget(manager, owner, groups), false);
  assert.equal(canManagePermissionsForTarget(manager, manager, groups), false);
});
