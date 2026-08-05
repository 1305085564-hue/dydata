import test from "node:test";
import assert from "node:assert/strict";

import {
  filterUsableLeaderCandidates,
  filterVisibleTeamManagementProfiles,
  isIgnoredTeamManagementUser,
  resolveTeamManagementAccess,
  type TeamManagementProfile,
} from "./team-management";

test("owner 可以查看并编辑所有团队成员", () => {
  const access = resolveTeamManagementAccess({ id: "owner-1", name: "阿禅", role: "owner" });
  assert.equal(access.level, "owner");
  assert.equal(access.canView, true);
  assert.equal(access.canEditMembers, true);
  assert.equal(access.teamIds, null);
});

test("admin 只能查看并编辑自己的团队", () => {
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

test("member 没有团队时不可见", () => {
  const access = resolveTeamManagementAccess({ id: "member-1", name: "成员甲", role: "member" });
  assert.equal(access.canView, false);
  assert.deepEqual(access.teamIds, []);
});

test("团队成员只看得到同团队成员", () => {
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

test("可用组长候选人必须是同团队 admin 且不在屏蔽名单", () => {
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
