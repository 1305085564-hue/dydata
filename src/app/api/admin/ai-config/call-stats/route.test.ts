import assert from "node:assert/strict";
import test from "node:test";

import { buildCallStatsResponse } from "./route";

const auth = {
  supabase: {},
  actor: { userId: "owner-1", role: "owner" },
} as never;

test("call-stats 复用 manage_system 权限并返回数据库聚合结果", async () => {
  let rpcName = "";
  const response = await buildCallStatsResponse({
    requireSystemActor: async () => auth,
    createAdminClient: () => ({
      rpc(name: string) {
        rpcName = name;
        return Promise.resolve({
          data: {
            generatedAt: "2026-11-19T04:00:00.000Z",
            channels: [],
            features: [],
            recentFailures: [],
          },
          error: null,
        });
      },
    }) as never,
  });

  assert.equal(response.status, 200);
  assert.equal(rpcName, "get_ai_call_stats");
  assert.deepEqual(await response.json(), {
    generatedAt: "2026-11-19T04:00:00.000Z",
    channels: [],
    features: [],
    recentFailures: [],
  });
});

test("call-stats 未通过系统权限时不访问数据库", async () => {
  let called = false;
  const response = await buildCallStatsResponse({
    requireSystemActor: async () => ({ error: "无权限", status: 403 }) as never,
    createAdminClient: () => {
      called = true;
      return { rpc: async () => ({ data: null, error: null }) } as never;
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "无权限" });
  assert.equal(called, false);
});
