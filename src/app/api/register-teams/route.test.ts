import assert from "node:assert/strict";
import test from "node:test";

import { buildRegisterTeamsResponse } from "./route";

test("register-teams 返回真实团队 id/name，绝不返回假 default id", async () => {
  const res = await buildRegisterTeamsResponse({
    getTeamOptions: async () => [
      { id: "t1", name: "深圳一部" },
      { id: "t2", name: "深圳二部" },
    ],
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.teams));
  assert.equal(body.teams.length, 2);
  for (const team of body.teams) {
    assert.notEqual(team.id, "default");
  }
  assert.deepEqual(body.teams, [
    { id: "t1", name: "深圳一部" },
    { id: "t2", name: "深圳二部" },
  ]);
});

test("register-teams 直接透传 getTeamOptions，与 registerUser 使用的团队源一致", async () => {
  const sharedTeams = [{ id: "abc-123", name: "华南组" }];
  const getTeamOptions = async () => sharedTeams;

  const res = await buildRegisterTeamsResponse({ getTeamOptions });
  const body = await res.json();

  assert.deepEqual(body.teams, sharedTeams);
});

test("getTeamOptions 超时或失败时返回空数组和 503，而不是伪造 default 团队", async () => {
  const res = await buildRegisterTeamsResponse({
    getTeamOptions: async () => {
      throw new Error("db unreachable");
    },
  });
  const body = await res.json();

  assert.equal(res.status, 503);
  assert.deepEqual(body.teams, []);
});
