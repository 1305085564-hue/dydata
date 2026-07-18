import test from "node:test";
import assert from "node:assert/strict";

import { buildPermissionContextForActor, buildPermissionContextFromPermissionInfo } from "./current-permission-context";

test("缺少服务端配置时权限上下文构建明确失败", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const info = { userId: "u1", name: null, role: "member", businessRole: "member", permissions: {}, accessLevel: null, teamId: null, groupId: null, ledGroupIds: [] };
  try {
    await assert.rejects(() => buildPermissionContextFromPermissionInfo(info as never), /Missing/);
    await assert.rejects(() => buildPermissionContextForActor({ ...info, id: undefined } as never), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
