import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardLeaderboardResponse } from "../leaderboard/route";
import { buildDashboardTrendResponse } from "../trend/route";

const permissionContext = {
  scope: {
    visibleUserIds: ["user-1"],
  },
};

function queryResult(
  result: { data: unknown; error: unknown },
  options: {
    pages?: Array<{ data: unknown; error: unknown }>;
    onRange?: (from: number, to: number) => void;
    onGte?: (value: unknown) => void;
  } = {},
) {
  let offset = 0;
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    in() {
      return query;
    },
    gte(_column: unknown, value: unknown) {
      options.onGte?.(value);
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    range(from: number, to: number) {
      offset = from;
      options.onRange?.(from, to);
      return query;
    },
    then(
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(options.pages?.[offset === 0 ? 0 : 1] ?? result).then(resolve, reject);
    },
  };
  return query;
}

test("趋势查询失败不能返回空趋势并伪装为成功", async () => {
  const response = await buildDashboardTrendResponse({
    supabase: {
      from(table: string) {
        if (table === "accounts") {
          return queryResult({ data: null, error: null });
        }
        return queryResult({ data: null, error: { message: "trend read failed" } });
      },
      rpc() {
        return Promise.resolve({ data: null, error: null });
      },
    } as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error, "加载趋势失败");
});

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

test("趋势团队日报超过 1000 行时会继续分页读取", async () => {
  const ranges: Array<[number, number]> = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    report_date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    user_id: "user-1",
    play_count: index,
    follower_gain: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    favorites: 0,
  }));
  const secondPage = [{
    report_date: "2026-02-01",
    user_id: "user-1",
    play_count: 1000,
    follower_gain: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    favorites: 0,
  }];
  let dailyReportsQueryCount = 0;

  const response = await buildDashboardTrendResponse({
    supabase: {
      from(table: string) {
        if (table === "accounts") {
          return queryResult({ data: [], error: null });
        }
        if (table === "profiles") {
          return queryResult({ data: [{ id: "user-1", status: "active" }], error: null });
        }
        dailyReportsQueryCount += 1;
        if (dailyReportsQueryCount === 1) {
          return queryResult({ data: [], error: null });
        }
        return queryResult(
          { data: firstPage, error: null },
          { pages: [{ data: firstPage, error: null }, { data: secondPage, error: null }], onRange: (from, to) => ranges.push([from, to]) },
        );
      },
    } as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});

test("趋势和排行榜在 UTC 环境的北京时间凌晨仍按上海业务日计算窗口", async () => {
  const trendSinceDates: unknown[] = [];
  const leaderboardCalls: Array<Record<string, unknown>> = [];
  const query = () => queryResult({ data: [], error: null }, { onGte: (value) => trendSinceDates.push(value) });

  const trendResponse = await buildDashboardTrendResponse({
    supabase: {
      from() {
        return query();
      },
    } as never,
    userId: "user-1",
    permissionContext,
    now: new Date("2026-03-16T16:30:00.000Z"),
  });
  assert.equal(trendResponse.status, 200);

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
  assert.deepEqual(trendSinceDates, ["2026-02-15"]);
  assert.deepEqual(leaderboardCalls, [{ since_date: "2026-12-02" }]);
});
