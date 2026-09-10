import assert from "node:assert/strict";
import test from "node:test";

import { buildOperatorMembersResponse } from "./route";

test("责任人成员与已知团队名称并行加载且返回契约不变", async () => {
  let releaseMembers!: () => void;
  const membersGate = new Promise<void>((resolve) => { releaseMembers = resolve; });
  let membersStarted = false;
  let teamsStarted = false;

  const pending = buildOperatorMembersResponse({
    userId: "user-1",
    profile: { id: "user-1", team_id: "team-1", membership_status: "active" },
    loadMembers: async (profile) => {
      assert.equal(profile.team_id, "team-1");
      membersStarted = true;
      await membersGate;
      return {
        data: [
          { id: "user-2", name: "小林", team_id: "team-1", membership_status: "active" },
          { id: "user-1", name: "小陈", team_id: "team-1", membership_status: "active" },
        ],
        error: null,
      };
    },
    loadTeams: async (teamIds) => {
      assert.deepEqual(teamIds, ["team-1"]);
      teamsStarted = true;
      return { data: [{ id: "team-1", name: "内容一部" }], error: null };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(membersStarted, true);
    assert.equal(teamsStarted, true, "团队名称查询不应等待成员列表返回");
  } finally {
    releaseMembers();
  }

  const response = await pending;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    currentUserId: "user-1",
    members: [
      { id: "user-1", name: "小陈", display_name: "小陈", department: "内容一部", team_id: "team-1" },
      { id: "user-2", name: "小林", display_name: "小林", department: "内容一部", team_id: "team-1" },
    ],
  });
});
