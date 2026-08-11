import test from "node:test";
import assert from "node:assert/strict";

import {
  countProfilesInTeamForView,
  filterProfilesForMemberView,
  formatLastLoginDisplay,
  getSelectableCurrentScreenMemberIds,
  getVisibleTeamOptions,
  resolveDefaultSelectedTeamId,
  isProfileExemptOnDate,
  retainSelectableMemberIds,
  resolveSelectedTeamAfterTeamDelete,
  type TeamViewProfile,
} from "./team-view-logic";

const teams = [
  { id: "team-1", name: "经营组" },
  { id: "team-2", name: "内容组" },
];

const activeProfiles: TeamViewProfile[] = [
  { id: "owner-1", name: "阿禅", email: "owner@example.com", team_id: "team-1", team_name: "经营组" },
  { id: "member-1", name: "小王", email: "w@example.com", team_id: "team-1", team_name: "经营组" },
  { id: "member-2", name: "小李", email: "l@example.com", team_id: "team-2", team_name: "内容组" },
];

const archivedProfiles: TeamViewProfile[] = [
  {
    id: "archived-1",
    name: "旧成员甲",
    email: "a@example.com",
    team_id: null,
    team_name: null,
    archive_reason: "离职",
    archive_snapshot: { team_id: "team-1", team_name: "经营组" },
  },
  {
    id: "archived-2",
    name: "旧成员乙",
    email: "b@example.com",
    team_id: null,
    team_name: null,
    archive_reason: "转岗",
    archive_snapshot: { team_id: "team-2", team_name: "内容组" },
  },
];

test("非 owner 的团队筛选只展示当前可管理团队，不暴露全量团队", () => {
  assert.deepEqual(
    getVisibleTeamOptions({
      isOwner: false,
      allTeams: teams,
      manageableTeams: [teams[0]],
    }),
    [teams[0]],
  );

  assert.deepEqual(
    getVisibleTeamOptions({
      isOwner: true,
      allTeams: teams,
      manageableTeams: [teams[0]],
    }),
    teams,
  );
});

test("归档视图按归档前团队筛选，避免顶部团队筛选失效", () => {
  assert.deepEqual(
    filterProfilesForMemberView({
      profiles: archivedProfiles,
      memberView: "archived",
      selectedTeamId: "team-1",
      searchQuery: "",
    }).map((profile) => profile.id),
    ["archived-1"],
  );

  assert.equal(countProfilesInTeamForView(archivedProfiles, "archived", "team-2"), 1);
});

test("当前屏全选排除当前登录人，避免批量归档自己", () => {
  assert.deepEqual(
    getSelectableCurrentScreenMemberIds(activeProfiles, "owner-1"),
    ["member-1", "member-2"],
  );
});

test("删除当前筛选团队后自动回到全员大盘", () => {
  assert.equal(resolveSelectedTeamAfterTeamDelete("team-1", "team-1"), "__all__");
  assert.equal(resolveSelectedTeamAfterTeamDelete("team-2", "team-1"), "team-2");
});


test("切换团队或搜索后清掉不可见的批量选择，避免批量操作误伤隐藏成员", () => {
  assert.deepEqual(
    retainSelectableMemberIds(["member-1", "member-2"], ["member-2", "member-3"]),
    ["member-2"],
  );
});


test("默认优先进入自己团队视角，而不是公司全员视角", () => {
  assert.equal(
    resolveDefaultSelectedTeamId({
      currentUserId: "owner-1",
      profiles: activeProfiles,
      visibleTeams: teams,
      isOwner: true,
    }),
    "team-1",
  );
});

test("成员卡片只在当天仍生效时展示已豁免，过期临时豁免不再大面积误标", () => {
  assert.equal(
    isProfileExemptOnDate(
      {
        id: "member-expired",
        status: "active",
        exempt_type: "temporary",
        exempt_start_date: "2026-08-01",
        exempt_end_date: "2026-08-03",
      },
      "2026-08-11",
    ),
    false,
  );

  assert.equal(
    isProfileExemptOnDate(
      {
        id: "member-active",
        status: "active",
        exempt_type: "temporary",
        exempt_start_date: "2026-08-10",
        exempt_end_date: "2026-08-12",
      },
      "2026-08-11",
    ),
    true,
  );

  assert.equal(
    isProfileExemptOnDate({ id: "member-permanent", status: "exempt", exempt_type: "permanent" }, "2026-08-11"),
    true,
  );
});


test("最后登录时间只表达上次登录，不误写成在线或活跃时间", () => {
  assert.deepEqual(
    formatLastLoginDisplay("2026-07-01T10:30:00", new Date("2026-08-11T10:30:00")),
    { text: "2026-07-01 10:30（距上次登录 41 天）", isLoginStale: true },
  );

  assert.deepEqual(formatLastLoginDisplay(null, new Date("2026-08-11T10:30:00")), {
    text: "从未登录（疑似未激活）",
    isLoginStale: true,
  });
});
