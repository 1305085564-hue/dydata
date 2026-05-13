import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRoleChangeToMember,
  buildMemberTeamTransferPatch,
  canChangeMemberRole,
  canRemoveMemberTarget,
  getChangedAdminPermissions,
  getPermissionManagerCapabilities,
  hasAdminPermissionChanges,
  isProfileWriteApplied,
  resolvePermissionUpdate,
  resetMembersToBaseline,
  resolveMemberTeamTransfer,
  sanitizeMemberPermissions,
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

test("仅比较可编辑的权限变更并忽略 undefined 与 false 的差异", () => {
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
      permissions: {},
    },
  ];

  assert.equal(hasAdminPermissionChanges(editableMembers, baselineMembers), false);
  assert.deepEqual(getChangedAdminPermissions(editableMembers, baselineMembers), []);
});

test("保存时返回所有发生权限变化的成员（含 admin 与 member 的 AI 授权）", () => {
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
        use_ai_copywriting: true,
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
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        use_ai_copywriting: true,
      },
    },
  ]);
});

test("owner 给 admin 改权限时会完整保留所有权限 key", () => {
  const newPermissions = {
    view_all_data: true,
    manage_members: true,
    use_ai_copywriting: false,
    use_ai_management: true,
  };

  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "admin-1",
      targetRole: "admin",
      newPermissions,
    }),
    { permissions: newPermissions },
  );
});

test("owner 给 member 改权限时只写入 AI 权限 key", () => {
  const newPermissions = {
    view_all_data: true,
    manage_members: true,
    use_ai_copywriting: true,
    use_ai_management: false,
  };

  assert.deepEqual(sanitizeMemberPermissions(newPermissions), {
    use_ai_copywriting: true,
    use_ai_management: false,
  });

  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "member-1",
      targetRole: "member",
      newPermissions,
    }),
    {
      permissions: {
        use_ai_copywriting: true,
        use_ai_management: false,
      },
    },
  );
});

test("非 owner 调用权限更新会被拒绝", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "admin-1",
      targetId: "member-1",
      targetRole: "member",
      newPermissions: { use_ai_copywriting: true },
    }),
    { error: "仅创始人可操作" },
  );
});

test("不能修改自己的权限", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "owner-1",
      targetRole: "owner",
      newPermissions: { use_ai_management: true },
    }),
    { error: "不能修改自己的权限" },
  );
});

test("不能修改其他 owner 的权限", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      targetId: "owner-2",
      targetRole: "owner",
      newPermissions: { use_ai_management: true },
    }),
    { error: "不能修改创始人的权限" },
  );
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
      actorPermissions: {},
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "admin-1",
      targetRole: "admin",
      targetPermissions: {},
    }),
    true,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-1",
      targetRole: "owner",
      targetPermissions: {},
    }),
    false,
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
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

test("创始人可以调配任意非创始人成员团队", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: "team-1",
      newTeamId: "team-2",
    }),
    { shouldApply: true },
  );
});

test("负责人只能把未分配成员拉进本团队，或把本团队成员移出", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetTeamId: null,
      newTeamId: "team-1",
    }),
    { shouldApply: true },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
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

test("负责人跨团队调配会被拒绝", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-2",
      targetRole: "member",
      targetTeamId: "team-2",
      newTeamId: "team-1",
    }),
    { shouldApply: false, error: "负责人只能调配本团队/未分配成员" },
  );

  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
      actorId: "admin-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-3",
      targetRole: "member",
      targetTeamId: null,
      newTeamId: "team-2",
    }),
    { shouldApply: false, error: "负责人只能调配本团队/未分配成员" },
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

test("调配团队写入 profiles 时会同步清空 group_id", () => {
  assert.deepEqual(buildMemberTeamTransferPatch("team-2"), {
    team_id: "team-2",
    group_id: null,
  });
  assert.deepEqual(buildMemberTeamTransferPatch(null), {
    team_id: null,
    group_id: null,
  });
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
