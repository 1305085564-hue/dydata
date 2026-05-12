import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRoleChangeToMember,
  canChangeMemberRole,
  canRemoveMemberTarget,
  getChangedAdminPermissions,
  getPermissionManagerCapabilities,
  hasAdminPermissionChanges,
  isProfileWriteApplied,
  resetMembersToBaseline,
  type PermissionManagerMember,
} from "./权限管理";

const baselineMembers: PermissionManagerMember[] = [
  {
    id: "admin-1",
    name: "管理员甲",
    role: "admin",
    permissions: {
      view_all_data: true,
      edit_data: false,
      export_data: true,
    },
  },
  {
    id: "member-1",
    name: "成员乙",
    role: "member",
    permissions: {},
  },
];

test("仅比较管理员权限变更并忽略 undefined 与 false 的差异", () => {
  const editableMembers: PermissionManagerMember[] = [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {
        view_all_data: true,
        edit_data: undefined,
        export_data: true,
      },
    },
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        edit_data: true,
      },
    },
  ];

  assert.equal(hasAdminPermissionChanges(editableMembers, baselineMembers), false);
  assert.deepEqual(getChangedAdminPermissions(editableMembers, baselineMembers), []);
});

test("保存时仅返回发生权限变化的管理员", () => {
  const editableMembers: PermissionManagerMember[] = [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {
        view_all_data: true,
        edit_data: true,
        export_data: true,
      },
    },
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        edit_data: true,
      },
    },
  ];

  assert.equal(hasAdminPermissionChanges(editableMembers, baselineMembers), true);
  assert.deepEqual(getChangedAdminPermissions(editableMembers, baselineMembers), [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {
        view_all_data: true,
        edit_data: true,
        export_data: true,
      },
    },
  ]);
});

test("角色改为成员时清空权限，改回管理员时保留当前本地权限", () => {
  const toMember = applyRoleChangeToMember(baselineMembers, "admin-1", "member");
  assert.deepEqual(toMember, [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "member",
      permissions: {},
    },
    baselineMembers[1],
  ]);

  const backToAdmin = applyRoleChangeToMember(toMember, "admin-1", "admin");
  assert.deepEqual(backToAdmin, [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {},
    },
    baselineMembers[1],
  ]);
});

test("成员管理能力会按 owner 与 admin 权限返回", () => {
  assert.deepEqual(
    getPermissionManagerCapabilities("owner", {}),
    {
      canEditPermissions: true,
      canChangeRole: true,
      canRemoveMember: true,
    },
  );

  assert.deepEqual(
    getPermissionManagerCapabilities("admin", { manage_members: true }),
    {
      canEditPermissions: false,
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

test("负责人可以把本团队组员调整为管理员，但不能越权设负责人", () => {
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
    true,
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

test("创始人仍可调整非 owner 成员角色", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      newRole: "admin",
    }),
    true,
  );

  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-2",
      targetRole: "owner",
      targetPermissions: {},
      newRole: "admin",
    }),
    false,
  );
});

test("移除目标规则会拦住自己与越权目标", () => {
  assert.equal(
    canRemoveMemberTarget({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "member-1",
      targetRole: "member",
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "admin-1",
      targetRole: "admin",
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "owner-1",
      targetRole: "owner",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorId: "admin-1",
      targetId: "member-1",
      targetRole: "member",
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorId: "admin-1",
      targetId: "admin-2",
      targetRole: "admin",
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
      actorId: "admin-1",
      targetId: "owner-1",
      targetRole: "owner",
    }),
    false,
  );
});

test("权限管理写入必须确认真实命中目标行", () => {
  assert.equal(isProfileWriteApplied({ id: "member-1" }), true);
  assert.equal(isProfileWriteApplied(null), false);
  assert.equal(isProfileWriteApplied({ id: null }), false);
});

test("取消会恢复到当前基线快照", () => {
  const editableMembers: PermissionManagerMember[] = [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {
        view_all_data: false,
        edit_data: true,
        export_data: false,
      },
    },
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        edit_data: true,
      },
    },
  ];

  const reset = resetMembersToBaseline(editableMembers, baselineMembers);
  assert.deepEqual(reset, baselineMembers);
  assert.notStrictEqual(reset, baselineMembers);
});
