import assert from "node:assert/strict";
import test from "node:test";

import {
  STATS_START_DATE,
  buildOperators,
  buildPersonPayload,
  buildStaff,
  buildSummary,
  loadAttributionReport,
  queryScopedReports,
  type CollaborationAccount,
  type CollaborationProfile,
  type CollaborationReport,
} from "./_shared";

const profiles: CollaborationProfile[] = [
  { id: "owner-1", name: "达人甲", team_id: "team-1" },
  { id: "owner-2", name: "达人乙", team_id: "team-1" },
  { id: "operator-1", name: "王运营", team_id: "team-1" },
  { id: "writer-1", name: "张文案", team_id: "team-1" },
];

const accounts: CollaborationAccount[] = [
  { id: "account-1", name: "账号A", profile_id: "owner-1" },
  { id: "account-2", name: "账号B", profile_id: "owner-2" },
];

function report(overrides: Partial<CollaborationReport> = {}): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: overrides.user_id ?? "owner-1",
    report_date: overrides.report_date ?? STATS_START_DATE,
    account_id: overrides.account_id ?? "account-1",
    title: overrides.title ?? "视频标题",
    play_count: overrides.play_count ?? 100,
    follower_convert: overrides.follower_convert ?? 10,
    script_author_user_id: overrides.script_author_user_id ?? null,
    video_editor_user_id: overrides.video_editor_user_id ?? null,
    operator_user_id: overrides.operator_user_id ?? null,
  };
}

test("summary 识别空归属、自处理，并彻底排除统计起点之前的日报", () => {
  const rows = [
    report({ id: "empty", report_date: "2026-07-27" }),
    report({
      id: "self",
      report_date: "2026-07-28",
      script_author_user_id: "owner-1",
      video_editor_user_id: "owner-1",
      operator_user_id: "owner-1",
    }),
    report({
      id: "before-cutoff",
      report_date: "2026-07-26",
      script_author_user_id: "writer-1",
      video_editor_user_id: "writer-1",
      operator_user_id: "operator-1",
    }),
  ];

  assert.deepEqual(buildSummary(rows, profiles), {
    total: 2,
    attributed: 1,
    selfHandled: 1,
    unattributed: 1,
    neverFillMembers: [],
  });
});

test("summary 只把本月所有记录都由本人全包的成员列为从不填分工", () => {
  const rows = [
    report({
      id: "self-a",
      script_author_user_id: "owner-1",
      video_editor_user_id: "owner-1",
      operator_user_id: "owner-1",
    }),
    report({
      id: "self-b",
      report_date: "2026-07-28",
      script_author_user_id: "owner-1",
      video_editor_user_id: "owner-1",
      operator_user_id: "owner-1",
    }),
  ];

  assert.deepEqual(buildSummary(rows, profiles).neverFillMembers, [
    { userId: "owner-1", name: "达人甲" },
  ]);
});

test("operators 播放未达3万不判爆款，无前5条历史也不判爆款，上月无记录时环比为 null", () => {
  const current = [
    report({ id: "a", play_count: 100, operator_user_id: "operator-1" }),
    report({ id: "b", report_date: "2026-07-28", play_count: 1000, operator_user_id: "operator-1" }),
    report({ id: "c", account_id: "account-2", report_date: "2026-07-28", play_count: 500, operator_user_id: "operator-1" }),
    report({ id: "old", report_date: "2026-07-26", play_count: 999999, operator_user_id: "operator-1" }),
  ];

  const result = buildOperators(current, [], profiles, accounts);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 3);
  assert.equal(result[0]?.hitCount, 0);
  assert.equal(result[0]?.momChange, null);
});

test("operators 新爆款口径：≥3万且≥前5条均值×3才命中，上月零播放不产生 Infinity", () => {
  const current = [
    ...[10000, 10000, 10000, 10000].map((playCount, index) =>
      report({
        id: `current-${index}`,
        report_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        play_count: playCount,
        operator_user_id: "operator-1",
      }),
    ),
    report({ id: "current-hit", report_date: "2026-08-05", play_count: 35000, operator_user_id: "operator-1" }),
    report({ id: "account2", account_id: "account-2", report_date: "2026-08-03", play_count: 5000, operator_user_id: "operator-1" }),
  ];
  const previous = [
    report({ id: "previous", report_date: "2026-07-28", play_count: 0, operator_user_id: "operator-1" }),
  ];

  const result = buildOperators(current, previous, profiles, accounts);

  assert.equal(result[0]?.hitCount, 1);
  assert.equal(result[0]?.momChange, null);
});

test("staff 在空归属月份返回空列表，且只返回前 3 个账号和真实总数", () => {
  assert.deepEqual(buildStaff([report()], "writer", profiles, accounts), []);

  const manyAccounts = [1, 2, 3, 4].map((index) => ({
    id: `account-${index}`,
    name: `账号${index}`,
    profile_id: "owner-1",
  }));
  const rows = manyAccounts.map((account, index) =>
    report({
      id: `writer-${index}`,
      account_id: account.id,
      report_date: `2026-07-${27 + index}`,
      script_author_user_id: "writer-1",
    }),
  );

  const result = buildStaff(rows, "writer", profiles, manyAccounts);
  assert.equal(result[0]?.involvedAccounts.length, 3);
  assert.equal(result[0]?.involvedAccountTotal, 4);
});

test("person 软配对失败返回 anomaly null，并保持近 6 个月完整零值趋势", () => {
  const payload = buildPersonPayload({
    targetUserId: "operator-1",
    year: 2026,
    month: 8,
    reports: [
      report({
        id: "person-current",
        report_date: "2026-08-02",
        operator_user_id: "operator-1",
      }),
      report({
        id: "person-old",
        report_date: "2026-07-26",
        operator_user_id: "operator-1",
      }),
    ],
    profile: profiles[1],
    profiles,
    accounts,
    videos: [],
  });

  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0]?.anomaly, null);
  assert.equal(payload.trend.length, 6);
  assert.equal(payload.currentMonth.operatorCount, 1);
  assert.equal(payload.operatorSummary, null);
});

test("日报聚合查询和补录目标查询都在数据库层强制统计起点下限", async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const listBuilder = {
    select(...args: unknown[]) { calls.push(["select", ...args]); return this; },
    in(...args: unknown[]) { calls.push(["in", ...args]); return this; },
    gte(...args: unknown[]) { calls.push(["gte", ...args]); return this; },
    lte(...args: unknown[]) { calls.push(["lte", ...args]); return this; },
    order(...args: unknown[]) { calls.push(["order", ...args]); return Promise.resolve({ data: [], error: null }); },
  };
  await queryScopedReports({
    supabase: { from: () => listBuilder } as never,
    visibleUserIds: ["owner-1"],
    start: "2026-07-01",
    end: "2026-07-31",
  });
  assert.ok(calls.some((call) => call[0] === "gte" && call[1] === "report_date" && call[2] === STATS_START_DATE));

  const singleCalls: Array<[string, ...unknown[]]> = [];
  const singleBuilder = {
    select(...args: unknown[]) { singleCalls.push(["select", ...args]); return this; },
    eq(...args: unknown[]) { singleCalls.push(["eq", ...args]); return this; },
    gte(...args: unknown[]) { singleCalls.push(["gte", ...args]); return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
  await loadAttributionReport({ from: () => singleBuilder } as never, "report-1");
  assert.ok(singleCalls.some((call) => call[0] === "gte" && call[1] === "report_date" && call[2] === STATS_START_DATE));
});
