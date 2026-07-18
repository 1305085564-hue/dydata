import test from "node:test";
import assert from "node:assert/strict";

import { getViewableTeamIds } from "./team-scope";

test("缺少服务端配置时团队范围查询明确失败，包括空 profileId", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(() => getViewableTeamIds("u1"), /Missing/);
    await assert.rejects(() => getViewableTeamIds(""), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
