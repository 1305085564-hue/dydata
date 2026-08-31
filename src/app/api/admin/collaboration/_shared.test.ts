import assert from "node:assert/strict";
import test from "node:test";

import {
  STATS_START_DATE,
  buildCollaborationPageData,
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

  assert.deepEqual(buildSummary(rows), {
    total: 2,
    attributed: 1,
    selfHandled: 1,
    unattributed: 1,
  });
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

test("operators 爆款口径：至少3条历史样本、播放≥3万且≥前5条均值×3才命中", () => {
  const current = [
    ...[10000, 10000, 10000].map((playCount, index) =>
      report({
        id: `current-${index}`,
        report_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        play_count: playCount,
        operator_user_id: "operator-1",
      }),
    ),
    report({ id: "current-hit", report_date: "2026-08-04", play_count: 30000, operator_user_id: "operator-1" }),
  ];
  const result = buildOperators(current, [], profiles, accounts);

  assert.equal(result.length, 1, "只负责一个账号的运营也应进入岗位月报");
  assert.equal(result[0]?.hitCount, 1);
  assert.equal(result[0]?.momChange, null);
  assert.equal(result[0]?.accountCount, 1);
});

test("operators 播放不足3万或历史样本不足3条时不计爆款", () => {
  const belowThreshold = buildOperators([
    ...[10000, 10000, 10000].map((playCount, index) =>
      report({
        id: `threshold-${index}`,
        report_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        play_count: playCount,
        operator_user_id: "operator-1",
      }),
    ),
    report({ id: "below-threshold", report_date: "2026-08-04", play_count: 29999, operator_user_id: "operator-1" }),
  ], [], profiles, accounts);
  const insufficientSamples = buildOperators([
    report({ id: "sample-1", report_date: "2026-08-01", play_count: 10000, operator_user_id: "operator-1" }),
    report({ id: "sample-2", report_date: "2026-08-02", play_count: 10000, operator_user_id: "operator-1" }),
    report({ id: "too-early", report_date: "2026-08-03", play_count: 30000, operator_user_id: "operator-1" }),
  ], [], profiles, accounts);

  assert.equal(belowThreshold[0]?.hitCount, 0);
  assert.equal(insufficientSamples[0]?.hitCount, 0);
});

test("operators 过滤纯自运营：达人只运营自己账号时不进入运营列表", () => {
  const ownAccount: CollaborationAccount = { id: "account-op", name: "运营自己号", profile_id: "operator-1" };
  const rows = [
    report({ id: "self-1", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
    report({ id: "self-2", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
  ];

  assert.deepEqual(buildOperators(rows, [], profiles, [ownAccount]), []);
});

test("operators 混合归属时只统计给别人的账号做运营的日报", () => {
  const ownAccount: CollaborationAccount = { id: "account-op", name: "运营自己号", profile_id: "operator-1" };
  const rows = [
    report({ id: "self-1", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
    report({ id: "self-2", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
    report({ id: "other-1", play_count: 100, operator_user_id: "operator-1" }),
  ];

  const result = buildOperators(rows, [], profiles, [...accounts, ownAccount]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 1);
  assert.equal(result[0]?.totalPlay, 100);
  assert.equal(result[0]?.accountCount, 1);
  assert.equal(result[0]?.accounts[0]?.accountId, "account-1");
});

test("operators 账号未绑定主人时按别人的账号计入", () => {
  const unbound: CollaborationAccount = { id: "account-free", name: "无主账号", profile_id: null };
  const rows = [report({ id: "free-1", account_id: "account-free", operator_user_id: "operator-1" })];

  const result = buildOperators(rows, [], profiles, [unbound]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.accountCount, 1);
});

test("staff 过滤自写自剪：只统计给别人的账号干的活", () => {
  const writerOwn: CollaborationAccount = { id: "account-w", name: "文案自己号", profile_id: "writer-1" };
  const rows = [
    report({ id: "w-self", account_id: "account-w", script_author_user_id: "writer-1" }),
    report({ id: "w-other", script_author_user_id: "writer-1" }),
  ];

  const result = buildStaff(rows, "writer", profiles, [...accounts, writerOwn]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 1);
  assert.equal(result[0]?.involvedAccounts[0]?.accountId, "account-1");
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

test("staff 单账号也进入岗位月报，并返回最近作品供页面直接查看", () => {
  const rows = [
    report({
      id: "writer-old",
      report_date: "2026-08-01",
      title: "第一条作品",
      script_author_user_id: "writer-1",
    }),
    report({
      id: "writer-new",
      report_date: "2026-08-02",
      title: "第二条作品",
      script_author_user_id: "writer-1",
    }),
  ];

  const result = buildStaff(rows, "writer", profiles, accounts);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 2);
  assert.deepEqual(result[0]?.recentWorks.map((work) => work.title), ["第二条作品", "第一条作品"]);
});

test("岗位页服务端数据包含当前文案或剪辑标签，避免路由切换后误报空数据", () => {
  const currentRows = [
    report({ id: "writer-work", title: "文案作品", script_author_user_id: "writer-1" }),
  ];

  const pageData = buildCollaborationPageData(
    { currentRows, previousRows: [], profiles, accounts },
    "writer",
  );

  assert.equal(pageData.staff.length, 1);
  assert.equal(pageData.staff[0]?.recentWorks[0]?.title, "文案作品");
});

test("person 单账号运营仍返回岗位数据，软配对失败返回 anomaly null，并保持近 6 个月完整零值趋势", () => {
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
  assert.equal(payload.operatorSummary?.reportCount, 1);
  assert.equal(payload.operatorSummary?.accountCount, 1);
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
