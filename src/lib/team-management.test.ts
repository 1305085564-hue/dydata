import test from "node:test";
import assert from "node:assert/strict";

import {
  canManageTeamStructure,
  filterUsableLeaderCandidates,
  filterVisibleTeamManagementProfiles,
  isIgnoredTeamManagementUser,
  resolveTeamManagementAccess,
  type TeamManagementProfile,
} from "./team-management";

test("团队创建和删除只允许公司所有者，不能由 manage_members 推出", () => {
  assert.equal(canManageTeamStructure("admin", { manage_members: true }), false);
  assert.equal(canManageTeamStructure("member", { manage_members: true }), false);
  assert.equal(canManageTeamStructure("company_owner", { manage_members: true }), false);
  assert.equal(canManageTeamStructure("company_owner", { manage_members: true }, true), true);
  assert.equal(canManageTeamStructure("company_owner", {}, true), false);
  assert.equal(canManageTeamStructure("admin", { manage_members: true }, true), false);
});

test("groupMode=true 可以查看并编辑所有团队成员", () => {
  const access = resolveTeamManagementAccess({ id: "owner-1", name: "阿禅", role: "admin", company_role: "company_owner" }, true);
  assert.equal(access.level, "owner");
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);
  assert.equal(access.teamIds, null);
});

test("company_owner 在 groupMode=false 时只能查看并编辑自己公司的团队", () => {
  const access = resolveTeamManagementAccess({
    id: "owner-1",
    name: "阿禅",
    role: "admin",
    company_role: "company_owner",
    team_id: "team-1",
  }, false);
  assert.equal(access.level, "admin");
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);
  assert.deepEqual(access.teamIds, ["team-1"]);
});

test("company_owner 不能仅因 role=owner 获得集团范围", () => {
  const access = resolveTeamManagementAccess({
    id: "owner-1",
    name: "阿禅",
    role: "owner",
    team_id: "team-1",
  }, false);
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);
  assert.deepEqual(access.teamIds, ["team-1"]);
});

test("groupMode 关闭或过期后回到当前公司范围", () => {
  const beforeAccess = resolveTeamManagementAccess({
    id: "owner-1",
    name: "阿禅",
    role: "admin",
    company_role: "company_owner",
    team_id: "team-1",
  }, true);
  assert.equal(beforeAccess.teamIds, null);

  const afterAccess = resolveTeamManagementAccess({
    id: "owner-1",
    name: "阿禅",
    role: "admin",
    company_role: "company_owner",
    team_id: "team-1",
  }, false);
  assert.deepEqual(afterAccess.teamIds, ["team-1"]);
});

test("admin 只能查看并编辑自己团队成员", () => {
  const access = resolveTeamManagementAccess({
    id: "admin-1",
    name: "十八",
    role: "admin",
    team_id: "team-1",
    permissions: { manage_members: true },
  });

  assert.equal(access.level, "admin");
  assert.deepEqual(access.teamIds, ["team-1"]);
});

test("没有团队归属的 admin 不能查看或编辑成员", () => {
  const access = resolveTeamManagementAccess({
    id: "admin-1",
    name: "十八",
    role: "admin",
    permissions: { manage_members: true },
  });

  assert.equal(access.canView, false);
  assert.equal(access.canEditMembers, false);
  assert.deepEqual(access.teamIds, []);
});

test("普通 admin 不能靠布尔型 groupMode 参数获得集团成员列表", () => {
  const access = resolveTeamManagementAccess({
    id: "admin-1",
    name: "负责人",
    role: "admin",
    company_role: "admin",
    team_id: "team-1",
    permissions: { manage_members: true },
  }, true);
  assert.deepEqual(access.teamIds, ["team-1"]);
});

test("member 没有团队时不可见，且无法编辑成员", () => {
  const access = resolveTeamManagementAccess({ id: "member-1", name: "成员甲", role: "member" });
  assert.equal(access.canView, false);
  assert.equal(access.canEditMembers, false);
  assert.deepEqual(access.teamIds, []);
});

test("组长成员管理页只看得到自己团队成员", () => {
  const access = resolveTeamManagementAccess({
    id: "admin-1",
    name: "负责人甲",
    role: "admin",
    team_id: "team-1",
    permissions: { manage_members: true },
  });

  const profiles: TeamManagementProfile[] = [
    { id: "a", name: "A", role: "admin", team_id: "team-1" },
    { id: "b", name: "B", role: "member", team_id: "team-2" },
  ];

  assert.deepEqual(filterVisibleTeamManagementProfiles(access, profiles).map((profile) => profile.id), ["a"]);
});

test("可用组长候选人仅来自本团队 admin 且不在屏蔽名单", () => {
  const access = resolveTeamManagementAccess({
    id: "admin-1",
    name: "负责人甲",
    role: "admin",
    team_id: "team-1",
    permissions: { manage_members: true },
  });

  const profiles: TeamManagementProfile[] = [
    { id: "leader-1", name: "组长甲", role: "admin", team_id: "team-1", permissions: { manage_members: false } },
    { id: "leader-2", name: "组长乙", role: "admin", team_id: "team-2", permissions: { manage_members: false } },
    { id: "manager-1", name: "负责人甲", role: "admin", team_id: "team-1", permissions: { manage_members: true } },
    { id: "codex-1", name: "Codex", email: "codex-admin-demo@dydata.local", role: "admin", team_id: "team-1" },
  ];

  assert.deepEqual(filterUsableLeaderCandidates(access, profiles).map((profile) => profile.id), ["leader-1"]);
  assert.equal(isIgnoredTeamManagementUser({ name: "Codex", email: "x@dydata.local" }), true);
});
