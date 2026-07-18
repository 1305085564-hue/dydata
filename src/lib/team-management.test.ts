import test from "node:test";
import assert from "node:assert/strict";

import {
  canAssignMemberToGroup,
  canManageGroup,
  canUseLeaderCandidate,
  filterUsableLeaderCandidates,
  filterVisibleTeamManagementProfiles,
  isIgnoredTeamManagementUser,
  resolveTeamManagementAccess,
  type TeamManagementGroup,
  type TeamManagementProfile,
} from "./team-management";

const groups: TeamManagementGroup[] = [
  { id: "group-1", name: "第一组", team_id: "team-1", leader_user_id: "leader-1" },
  { id: "group-2", name: "第二组", team_id: "team-2", leader_user_id: "leader-2" },
];

test("owner 可以管理所有团队和组", () => {
  const access = resolveTeamManagementAccess({ id: "owner-1", name: "阿禅", role: "owner" }, groups);

  assert.equal(access.level, "owner");
  assert.equal(canManageGroup(access, groups[0]), true);
  assert.equal(canManageGroup(access, groups[1]), true);
});

test("有成员管理权限的 admin 只能管理自己团队的组", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "admin-1",
      name: "十八",
      role: "admin",
      team_id: "team-1",
      permissions: { manage_members: true },
    },
    groups,
  );

  assert.equal(access.level, "team_admin");
  assert.equal(canManageGroup(access, groups[0]), true);
  assert.equal(canManageGroup(access, groups[1]), false);
});

test("普通组长 admin 可以查看整个团队，但不能修改分组", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "leader-1",
      name: "组长甲",
      role: "admin",
      team_id: "team-1",
      permissions: {},
    },
    groups,
  );

  assert.equal(access.level, "group_leader");
  assert.equal(canManageGroup(access, groups[0]), false);
  assert.equal(canManageGroup(access, groups[1]), false);
});

test("member 没有团队分组管理入口", () => {
  const access = resolveTeamManagementAccess({ id: "member-1", name: "成员甲", role: "member" }, groups);

  assert.deepEqual(access, {
    level: "none",
    canView: false,
    canEditGroups: false,
    teamIds: [],
    groupIds: [],
  });
});

test("只能把 member 分配到同团队组内，也可以移回直管", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "admin-1",
      name: "负责人甲",
      role: "admin",
      team_id: "team-1",
      permissions: { manage_members: true },
    },
    groups,
  );
  const member: TeamManagementProfile = { id: "member-1", name: "成员甲", role: "member", team_id: "team-1" };
  const otherTeamMember: TeamManagementProfile = { id: "member-2", name: "成员乙", role: "member", team_id: "team-2" };
  const admin: TeamManagementProfile = { id: "admin-2", name: "管理员乙", role: "admin", team_id: "team-1" };

  assert.equal(canAssignMemberToGroup(access, member, groups[0]), true);
  assert.equal(canAssignMemberToGroup(access, member, null), true);
  assert.equal(canAssignMemberToGroup(access, otherTeamMember, groups[0]), false);
  assert.equal(canAssignMemberToGroup(access, admin, groups[0]), false);
});

test("组长候选必须是同团队非负责人的 admin，并忽略 Codex 测试账号", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "admin-1",
      name: "负责人甲",
      role: "admin",
      team_id: "team-1",
      permissions: { manage_members: true },
    },
    groups,
  );

  assert.equal(
    canUseLeaderCandidate(
      access,
      { id: "leader-1", name: "十八", role: "admin", team_id: "team-1", permissions: { manage_members: false } },
      "team-1",
    ),
    true,
  );
  assert.equal(
    canUseLeaderCandidate(
      access,
      { id: "manager-1", name: "负责人甲", role: "admin", team_id: "team-1", permissions: { manage_members: true } },
      "team-1",
    ),
    false,
  );
  assert.equal(
    canUseLeaderCandidate(access, { id: "leader-2", name: "其他负责人", role: "admin", team_id: "team-2" }, "team-1"),
    false,
  );
  assert.equal(
    canUseLeaderCandidate(
      access,
      { id: "codex-1", name: "Codex?????", email: "codex-admin-demo@dydata.local", role: "admin", team_id: "team-1" },
      "team-1",
    ),
    false,
  );
  assert.equal(isIgnoredTeamManagementUser({ name: "Codex?????", email: "x@qq.com" }), true);
});

test("团队管理响应不会泄露其他团队的组长候选人", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "admin-1",
      name: "负责人甲",
      role: "admin",
      team_id: "team-1",
      permissions: { manage_members: true },
    },
    groups,
  );
  const profiles: TeamManagementProfile[] = [
    { id: "leader-1", name: "组长甲", role: "admin", team_id: "team-1", permissions: {} },
    { id: "leader-2", name: "组长乙", role: "admin", team_id: "team-2", permissions: {} },
    { id: "manager-2", name: "负责人乙", role: "admin", team_id: "team-1", permissions: { manage_members: true } },
  ];

  assert.deepEqual(
    filterUsableLeaderCandidates(access, profiles).map((profile) => profile.id),
    ["leader-1"],
  );
});

test("普通组长只看到本组成员和本组组长", () => {
  const access = resolveTeamManagementAccess(
    {
      id: "leader-1",
      name: "组长甲",
      role: "admin",
      team_id: "team-1",
      permissions: {},
    },
    groups,
  );
  const profiles: TeamManagementProfile[] = [
    { id: "leader-1", name: "组长甲", role: "admin", team_id: "team-1" },
    { id: "member-1", name: "成员甲", role: "member", team_id: "team-1", group_id: "group-1" },
    { id: "member-2", name: "成员乙", role: "member", team_id: "team-1", group_id: null },
    { id: "member-3", name: "成员丙", role: "member", team_id: "team-2", group_id: "group-2" },
  ];

  assert.deepEqual(
    filterVisibleTeamManagementProfiles(access, profiles, groups).map((profile) => profile.id),
    ["leader-1", "member-1", "member-2"],
  );
});
