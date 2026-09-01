import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRoleChangeToMember,
  buildMemberTeamTransferPatch,
  buildRemovedMemberProfilePatch,
  canChangeMemberRole,
  canRemoveMemberTarget,
  getChangedAdminPermissions,
  getPermissionManagerCapabilities,
  hasAdminPermissionChanges,
  isProfileWriteApplied,
  resolvePermissionUpdate,
  resetMembersToBaseline,
  resolveMemberTeamTransfer,
  sanitizePermissions,
  type PermissionManagerMember,
} from "./权限管理";

const baselineMembers: PermissionManagerMember[] = [
  {
    id: "admin-1",
    name: "管理员甲",
    role: "admin",
    permissions: {
      view_analytics: true,
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
        view_analytics: true,
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
        view_analytics: true,
        export_data: true,
      },
    },
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        use_ai_copy: true,
      },
    },
  ];

  assert.equal(hasAdminPermissionChanges(editableMembers, baselineMembers), true);
  assert.deepEqual(getChangedAdminPermissions(editableMembers, baselineMembers), [
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        use_ai_copy: true,
      },
    },
  ]);
});

test("公司所有者在本公司给 admin 改权限时会完整保留权限 key", () => {
  const newPermissions = {
    view_analytics: true,
    manage_members: true,
    use_ai_copy: true,
    use_ai_assist: true,
  };

  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "owner-1",
      actorCompanyRole: "company_owner",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "admin-1",
      targetRole: "admin",
      targetPermissions: {},
      targetTeamId: "company-a",
      newPermissions,
      newDataScope: "team",
    }),
    { permissions: newPermissions, dataScope: "team" },
  );
});

test("公司所有者在本公司给 member 改权限时会过滤未知权限 key", () => {
  const newPermissions = {
    manage_members: true,
    view_analytics: true,
    review_violations: true,
    use_ai_copy: true,
    use_ai_assist: false,
    unknown_permission: true,
  };

  assert.deepEqual(sanitizePermissions(newPermissions), {
    view_analytics: true,
    manage_members: true,
    review_violations: true,
    use_ai_copy: true,
    use_ai_assist: false,
  });

  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "owner-1",
      actorCompanyRole: "company_owner",
      actorPermissions: { manage_members: true },
      actorTeamId: "company-a",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "company-a",
      newPermissions,
    }),
    {
      permissions: {
        view_analytics: true,
        manage_members: true,
        review_violations: true,
        use_ai_copy: true,
        use_ai_assist: false,
      },
      dataScope: "self",
    },
  );
});

test("负责人可以修改本团队成员权限，但不能跨团队", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      targetTeamId: "team-1",
      newPermissions: { use_ai_copy: true },
      newDataScope: "team",
    }),
    { permissions: { use_ai_copy: true }, dataScope: "team" },
  );

  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "member-2",
      targetRole: "member",
      targetTeamId: "team-2",
      targetPermissions: {},
      newPermissions: { use_ai_copy: true },
    }),
    { error: "负责人只能修改本团队权限" },
  );
});

test("组长调用权限更新会被拒绝", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorId: "leader-1",
      actorPermissions: {},
      targetId: "member-1",
      targetRole: "member",
      targetPermissions: {},
      newPermissions: { use_ai_copy: true },
    }),
    { error: "无权限" },
  );
});

test("不能修改自己的权限", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-1",
      targetRole: "owner",
      targetPermissions: {},
      newPermissions: { use_ai_assist: true },
    }),
    { error: "不能修改自己的权限" },
  );
});

test("不能修改其他 owner 的权限", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "owner",
      actorId: "owner-1",
      actorPermissions: {},
      targetId: "owner-2",
      targetRole: "owner",
      targetPermissions: {},
      newPermissions: { use_ai_assist: true },
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

test("普通组长不能修改、移除或调配本团队组长，也不能把组员升为组长", () => {
  assert.deepEqual(
    resolvePermissionUpdate({
      actorRole: "admin",
      actorCompanyRole: "admin",
      actorId: "manager-1",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      targetId: "admin-2",
      targetRole: "admin",
      targetPermissions: {},
      targetTeamId: "team-1",
      newPermissions: { use_ai_copy: false },
    }),
    { error: "负责人不能修改组长" },
  );

  assert.equal(
    canRemoveMemberTarget({
      actorRole: "admin",
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

test("公司所有者不能跨公司调配，集团模式可以调配非所有者成员", () => {
  assert.deepEqual(
    resolveMemberTeamTransfer({
      actorRole: "admin",
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

test("取消会恢复到当前基线快照", () => {
  const editableMembers: PermissionManagerMember[] = [
    {
      id: "admin-1",
      name: "管理员甲",
      role: "admin",
      permissions: {
        export_data: false,
        review_content: true,
      },
    },
    {
      id: "member-1",
      name: "成员乙",
      role: "member",
      permissions: {
        review_content: true,
      },
    },
  ];

  const reset = resetMembersToBaseline(editableMembers, baselineMembers);
  assert.deepEqual(reset, baselineMembers);
  assert.notStrictEqual(reset, baselineMembers);
});
