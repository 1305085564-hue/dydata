import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardLeaderboardResponse } from "./route";

const permissionContext = {
  scope: {
    visibleUserIds: ["user-1"],
  },
};

function makeReportRow(input: {
  id: string;
  profileId: string;
  accountName: string;
  reportDate?: string;
}) {
  return {
    id: input.id,
    account_id: `acct-${input.id}`,
    report_date: input.reportDate ?? "2026-11-15",
    created_at: "2026-11-15T10:00:00.000Z",
    play_count: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 3,
    follower_gain: 0,
    follower_convert: 0,
    completion_rate: 0.5,
    avg_play_duration: 10,
    bounce_rate_2s: 0.2,
    completion_rate_5s: 0.6,
    account: {
      name: input.accountName,
      profile_id: input.profileId,
      content_direction: null,
      presentation_format: null,
      profile: { name: `owner-${input.profileId}` },
    },
    video: null,
  };
}

function makeSupabaseMock(options: {
  accounts?: { data: unknown; error: unknown };
  dailyReports?: { data: unknown; error: unknown };
  onDailyReportGte?: (column: string, value: string) => void;
}) {
  const accountsResult = options.accounts ?? { data: [], error: null };
  const reportsResult = options.dailyReports ?? { data: [], error: null };

  return {
    from(table: string) {
      const result = table === "accounts" ? accountsResult : reportsResult;
      const query = {
        select() { return query; },
        eq() { return query; },
        or() { return query; },
        in() { return query; },
        order() { return query; },
        range() { return query; },
        abortSignal() { return query; },
        gte(column: string, value: string) {
          if (table === "daily_reports") options.onDailyReportGte?.(column, value);
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
    },
  };
}

test("排行榜查询失败不能返回空排行榜并伪装为成功", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({
      dailyReports: { data: null, error: { message: "leaderboard read failed" } },
    }) as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error, "加载排行榜失败");
});

test("排行榜只返回可见范围内的账号行", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({
      accounts: { data: [{ id: "account-1", content_direction: "大盘复盘" }], error: null },
      dailyReports: {
        data: [
          makeReportRow({ id: "r1", profileId: "user-1", accountName: "自己的号" }),
          makeReportRow({ id: "r2", profileId: "user-2", accountName: "同事的号" }),
        ],
        error: null,
      },
    }) as never,
    userId: "user-1",
    permissionContext,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(
    payload.leaderboardData.map((row: { profile_id: string; account_name: string }) => ({
      profile_id: row.profile_id,
      account_name: row.account_name,
    })),
    [{ profile_id: "user-1", account_name: "自己的号" }],
  );
  assert.deepEqual(payload.accountIds, ["account-1"]);
  assert.deepEqual(payload.ownContentDirections, ["大盘复盘"]);
});

test("排行榜在 UTC 环境的北京时间凌晨仍按上海业务日计算窗口", async () => {
  const gteCalls: Array<{ column: string; value: string }> = [];

  const leaderboardResponse = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({
      onDailyReportGte: (column, value) => gteCalls.push({ column, value }),
    }) as never,
    userId: "user-1",
    permissionContext,
    now: new Date("2026-12-31T16:30:00.000Z"),
  });
  assert.equal(leaderboardResponse.status, 200);
  assert.ok(gteCalls.some((c) => c.column === "report_date" && c.value === "2026-12-02"));
  assert.ok(gteCalls.some((c) => c.column === "video.published_at" && c.value === "2026-12-02T00:00:00+08:00"));
});

test("排行榜支持传入放宽后的 visibleUserIds（数据管理团队/全公司可见范围）", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({
      accounts: { data: [{ id: "account-1", content_direction: "大盘复盘" }], error: null },
      dailyReports: {
        data: [
          makeReportRow({ id: "r1", profileId: "user-1", accountName: "自己的号" }),
          makeReportRow({ id: "r2", profileId: "user-2", accountName: "组员A的号" }),
          makeReportRow({ id: "r3", profileId: "user-3", accountName: "组员B的号" }),
        ],
        error: null,
      },
    }) as never,
    userId: "user-1",
    permissionContext,
    visibleUserIds: ["user-1", "user-2", "user-3"],
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.leaderboardData.length, 3);
  assert.deepEqual(payload.leaderboardData.map((d: { account_name: string }) => d.account_name), [
    "自己的号",
    "组员A的号",
    "组员B的号",
  ]);
});

test("排行榜支持传入 year/month 查询指定历史月份，并严格过滤掉后续月份记录", async () => {
  const gteCalls: Array<{ column: string; value: string }> = [];
  const response = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({
      onDailyReportGte: (column, value) => gteCalls.push({ column, value }),
      dailyReports: {
        data: [
          makeReportRow({ id: "r1", profileId: "user-1", accountName: "9月初作品", reportDate: "2026-09-01" }),
          makeReportRow({ id: "r2", profileId: "user-1", accountName: "9月末作品", reportDate: "2026-09-30" }),
          makeReportRow({ id: "r3", profileId: "user-1", accountName: "10月作品", reportDate: "2026-10-01" }),
        ],
        error: null,
      },
    }) as never,
    userId: "user-1",
    permissionContext,
    year: 2026,
    month: 9,
    now: new Date("2026-11-17T00:00:00.000Z"),
  });

  assert.equal(response.status, 200);
  assert.ok(gteCalls.some((c) => c.column === "report_date" && c.value === "2026-09-01"));
  const payload = await response.json();
  assert.deepEqual(
    payload.leaderboardData.map((d: { account_name: string }) => d.account_name),
    ["9月末作品", "9月初作品"],
  );
});

test("排行榜传入非法 year/month 时返回 400", async () => {
  const response = await buildDashboardLeaderboardResponse({
    supabase: makeSupabaseMock({}) as never,
    userId: "user-1",
    permissionContext,
    year: 2026,
    month: 13,
  });

  assert.equal(response.status, 400);
});
