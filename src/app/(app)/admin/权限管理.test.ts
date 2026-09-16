import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemberTeamTransferPatch,
  buildRemovedMemberProfilePatch,
  canChangeMemberRole,
  canRemoveMemberTarget,
  getPermissionManagerCapabilities,
  isProfileWriteApplied,
  resolveMemberTeamTransfer,
} from "./权限管理";

test("成员管理能力区分普通组长与公司所有者", () => {
  assert.deepEqual(
    getPermissionManagerCapabilities("admin", { manage_members: true }, "admin"),
    {
      canEditPermissions: true,
      canChangeRole: false,
      canRemoveMember: true,
    },
  );

  assert.deepEqual(
    getPermissionManagerCapabilities("admin", { manage_members: true }, "company_owner"),
    {
      canEditPermissions: true,
      canChangeRole: true,
      canRemoveMember: true,
    },
  );

  assert.deepEqual(
    getPermissionManagerCapabilities("admin", { manage_members: false }),
    {
      canEditPermissions: false,
      canChangeRole: false,
      canRemoveMember: false,
    },
  );
});

test("普通组长不能升降组长，只能处理本团队组员的允许项", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-1",
      newRole: "admin",
    }),
    false,
  );

  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-2",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-2",
      newRole: "admin",
    }),
    false,
  );

  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "manager-2",
      targetRole: "admin",
      targetPermissions: { manage_members: true },
      targetTeamId: "team-1",
      newRole: "member",
    }),
    false,
  );
});

test("普通组长不能移除或调配本团队组长，也不能把组员升为组长", () => {
  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "admin-2",
      targetRole: "admin",
      targetPermissions: {},
      targetTeamId: "team-1",
    }),
    false,
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "admin-2",
      targetRole: "admin",
      targetTeamId: "team-1",
      newTeamId: "team-2",
    }),
    { shouldApply: false, error: "负责人不能调配组长" },
  );

  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-1",
      newRole: "admin",
    }),
    false,
  );
});

test("集团模式保留跨团队角色、权限和调配能力", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "group-owner-1",
      actorPermissions: { manage_members: true },
      groupMode: true,
      targetId: "admin-2",
      targetRole: "admin",
      targetPermissions: { manage_members: true },
      targetTeamId: "team-2",
      newRole: "member",
    }),
    true,
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "group-owner-1",
      actorPermissions: { manage_members: true },
      groupMode: true,
      targetId: "admin-2",
      targetRole: "admin",
      targetTeamId: "team-1",
      newTeamId: "team-2",
    }),
    { shouldApply: true },
  );
});

test("公司所有者可调整本公司非所有者成员角色，但不能调整所有者", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorId: "owner-1",
      actorCompanyRole: "company_owner",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "company-a",
      newRole: "admin",
    }),
    true,
  );

  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      actorId: "owner-1",
      actorCompanyRole: "company_owner",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "owner-2",
      targetRole: "owner",
      targetPermissions: {},
      targetTeamId: "company-a",
      newRole: "admin",
    }),
    false,
  );
});

test("移除目标规则会拦住自己、跨公司目标和所有者", () => {
  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "owner-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "company-a",
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "owner-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "member-2",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "company-b",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "owner-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "owner-1",
      targetRole: "owner",
      targetPermissions: {},
      targetTeamId: "company-a",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-1",
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "admin-2",
      targetRole: "admin",
      targetPermissions: {},
      targetTeamId: "team-1",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "owner-1",
      targetRole: "owner",
      targetPermissions: {},
      targetTeamId: "team-1",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-2",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-2",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: false },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-1",
    }),
    false,
  );
});

test("权限管理写入必须确认真实命中目标行", () => {
  assert.equal(isProfileWriteApplied({ id: "member-1" }), true);
  assert.equal(isProfileWriteApplied(null), false);
  assert.equal(isProfileWriteApplied({ id: null }), false);
});

test("公司所有者不能跨公司调配，集团模式可以调配非所有者成员", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "owner-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: "company-a",
      newTeamId: "company-b",
    }),
    { shouldApply: false, error: "负责人只能调配本团队/未分配成员" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "company_owner",
      actorId: "group-owner-1",
      actorPermissions: { manage_members: true },
      groupMode: true,
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: "company-a",
      newTeamId: "company-b",
    }),
    { shouldApply: true },
  );
});

test("组长只能把本团队成员移出团队，不能接管未分配成员", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: null,
      newTeamId: "team-1",
    }),
    { shouldApply: false, error: "负责人只能调配本团队成员" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: "team-1",
      newTeamId: null,
    }),
    { shouldApply: true },
  );
});

test("组长跨团队调配普通成员会被拒绝", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-2",
      targetRole: "member",
      targetTeamId: "team-2",
      newTeamId: "team-1",
    }),
    { shouldApply: false, error: "负责人只能调配本团队成员" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-3",
      targetRole: "member",
      targetTeamId: null,
      newTeamId: "team-2",
    }),
    { shouldApply: false, error: "负责人只能调配本团队成员" },
  );
});

test("普通成员不能调配团队，目标创始人也不能被调配", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "member",
      actorId: "member-1",
      actorPermissions: {},
      targetId: "member-2",
      targetRole: "member",
      targetTeamId: null,
      newTeamId: "team-1",
    }),
    { shouldApply: false, error: "无权限" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-2",
      targetRole: "owner",
      targetTeamId: "team-1",
      newTeamId: "team-2",
    }),
    { shouldApply: false, error: "不能调配创始人的团队" },
  );
});

test("调配自己的团队会被拒绝，相同团队幂等不需要写入", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-1",
      targetRole: "owner",
      targetTeamId: "team-1",
      newTeamId: "team-2",
    }),
    { shouldApply: false, error: "不能调配自己的团队" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: "team-1",
      newTeamId: "team-1",
    }),
    { shouldApply: false },
  );
});

test("调配团队写入 profiles 时只同步团队归属", () => {
  assert.deepEqual(buildMemberTeamTransferPatch("team-2"), {
    team_id: "team-2",
  });
  assert.deepEqual(buildMemberTeamTransferPatch(null), {
    team_id: null,
  });
});

test("移除成员写入 profiles 时会同步清空团队与分组归属", () => {
  assert.deepEqual(buildRemovedMemberProfilePatch(), {
    role: "member",
    permissions: {},
    team_id: null,
    data_scope: "self",
  });
});
