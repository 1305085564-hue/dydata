import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TEAM_NAME,
  ensureDefaultTeam,
  getTeamMeta,
  getTeamOptions,
  loadTeamOptions,
} from "./teams";

test("读取注册团队列表不会在 GET 链路创建默认团队", async () => {
  let inserted = false;
  const query = {
    select() { return this; },
    order: async () => ({ data: [{ id: "team-1", name: "深圳二部" }], error: null }),
    insert() {
      inserted = true;
      return this;
    },
  };

  const teams = await loadTeamOptions({ from: () => query } as never);
  assert.deepEqual(teams, [{ id: "team-1", name: "深圳二部" }]);
  assert.equal(inserted, false);
});

test("团队元数据清理空白并提供默认团队名", () => {
  assert.deepEqual(getTeamMeta({ team_id: " t1 ", team_name: " 一队 " }), { teamId: "t1", teamName: "一队" });
  assert.deepEqual(getTeamMeta(null), { teamId: null, teamName: DEFAULT_TEAM_NAME });
  assert.deepEqual(getTeamMeta({ team_id: 0, team_name: "" }), { teamId: null, teamName: DEFAULT_TEAM_NAME });
});

test("缺少服务端配置时团队数据库操作明确抛错", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(() => ensureDefaultTeam(), /Missing/);
    await assert.rejects(() => getTeamOptions(), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
