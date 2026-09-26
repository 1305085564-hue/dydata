import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardLeaderboardResponse } from "./route";

const permissionContext = {
  scope: {
    visibleUserIds: ["user-1"],
  },
};

function queryResult(result: { data: unknown; error: unknown }) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    then(
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

test("排行榜 RPC 查询失败不能返回空排行榜并伪装为成功", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: {
      from() {
        return queryResult({ data: [], error: null });
      },
      rpc() {
        return Promise.resolve({ data: null, error: { message: "leaderboard read failed" } });
      },
    } as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error, "加载排行榜失败");
});

test("排行榜只返回可见范围内的账号行", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: {
      from() {
        return queryResult({ data: [{ id: "account-1", content_direction: "大盘复盘" }], error: null });
      },
      rpc() {
        return Promise.resolve({
          data: [
            { profile_id: "user-1", account_name: "自己的号" },
            { profile_id: "user-2", account_name: "同事的号" },
          ],
          error: null,
        });
      },
    } as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.leaderboardData, [{ profile_id: "user-1", account_name: "自己的号" }]);
  assert.deepEqual(payload.accountIds, ["account-1"]);
  assert.deepEqual(payload.ownContentDirections, ["大盘复盘"]);
});

test("排行榜在 UTC 环境的北京时间凌晨仍按上海业务日计算窗口", async () => {
  const leaderboardCalls: Array<Record<string, unknown>> = [];
  const query = () => queryResult({ data: [], error: null });

  const leaderboardResponse = await buildDashboardLeaderboardResponse({
    supabase: {
      from() {
        return query();
      },
      rpc(_name: string, args: Record<string, unknown>) {
        leaderboardCalls.push(args);
        return Promise.resolve({ data: [], error: null });
      },
    } as never,
    userId: "user-1",
    permissionContext,
    now: new Date("2026-12-31T16:30:00.000Z"),
  });
  assert.equal(leaderboardResponse.status, 200);
  assert.deepEqual(leaderboardCalls, [{ since_date: "2026-12-02" }]);
});
