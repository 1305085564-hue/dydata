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

test("call-stats 数据库失败保留 500，响应脱敏并用同编号记录诊断", async () => {
  const original = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    const response = await buildCallStatsResponse({
      requireSystemActor: async () => auth,
      createAdminClient: () => ({ rpc: async () => ({ data: null, error: { message: 'permission denied for relation ai_call_attempts' } }) }) as never,
    }, new Request("https://dydata.cc/api/admin/ai-config/call-stats", { headers: { "x-request-id": "call-stats-failure" } }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "后台服务暂时不可用，稍后重试（编号：call-stats-failure）", requestId: "call-stats-failure" });
    assert.match(logs[0], /call-stats-failure/);
    assert.match(logs[0], /permission denied for relation ai_call_attempts/);
  } finally { console.error = original; }
});
