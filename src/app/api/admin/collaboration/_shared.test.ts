import assert from "node:assert/strict";
import test from "node:test";

import {
  STATS_START_DATE,
  buildCollaborationPageData,
  buildOperators,
  buildPersonPayload,
  buildStaff,
  buildSummary,
  buildTalents,
  loadAttributionReport,
  loadCollaborationMonthDataset,
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

test("operators 爆款样本不应受历史责任人归属影响", () => {
  const rows = [
    report({ id: "prior-1", report_date: "2026-08-01", play_count: 1000, operator_user_id: "operator-2" }),
    report({ id: "prior-2", report_date: "2026-08-02", play_count: 1000, operator_user_id: "operator-2" }),
    report({ id: "prior-3", report_date: "2026-08-03", play_count: 1000, operator_user_id: null }),
    report({ id: "new-operator-hit", report_date: "2026-08-04", play_count: 30000, operator_user_id: "operator-1" }),
  ];

  const result = buildOperators(rows, [], profiles, accounts);

  assert.equal(result.find((row) => row.userId === "operator-1")?.hitCount, 1);
});

test("达人和运营爆款会使用上月以前的有效同账号样本", () => {
  const current = [
    report({ id: "september-hit", report_date: "2026-09-05", play_count: 30000, operator_user_id: "operator-1" }),
  ];
  const history = [
    report({ id: "july-1", report_date: "2026-07-27", play_count: 1000 }),
    report({ id: "july-2", report_date: "2026-07-28", play_count: 1000 }),
    report({ id: "july-3", report_date: "2026-07-29", play_count: 1000 }),
    ...current,
  ];

  assert.equal(buildOperators(current, [], profiles, accounts, history)[0]?.hitCount, 1);
  assert.equal(buildTalents(current, profiles, accounts, history)[0]?.hitCount, 1);
});

test("缺失播放量不能冒充爆款历史样本", () => {
  const missingSample = (id: string, reportDate: string) => ({
    ...report({ id, report_date: reportDate }),
    play_count: null,
  });
  const current = [
    report({ id: "candidate", report_date: "2026-08-04", play_count: 30000, operator_user_id: "operator-1" }),
  ];
  const history = [
    missingSample("missing-1", "2026-08-01"),
    missingSample("missing-2", "2026-08-02"),
    report({ id: "valid-1", report_date: "2026-08-03", play_count: 1000 }),
    ...current,
  ];

  assert.equal(buildOperators(current, [], profiles, accounts, history)[0]?.hitCount, 0);
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

test("operators 纯自营属于达人，不进入运营岗", () => {
  const ownAccount: CollaborationAccount = { id: "account-op", name: "运营自己号", profile_id: "operator-1" };
  const rows = [
    report({ id: "self-1", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
    report({ id: "self-2", account_id: "account-op", play_count: 500000, operator_user_id: "operator-1" }),
  ];

  const result = buildOperators(rows, [], profiles, [ownAccount]);

  assert.deepEqual(result, []);
});

test("operators 混合归属时只统计孵化别人的账号", () => {
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
  assert.deepEqual(result[0]?.accounts.map((account) => account.accountId), ["account-1"]);
});

test("operators 账号未绑定主人时按别人的账号计入", () => {
  const unbound: CollaborationAccount = { id: "account-free", name: "无主账号", profile_id: null };
  const rows = [report({ id: "free-1", account_id: "account-free", operator_user_id: "operator-1" })];

  const result = buildOperators(rows, [], profiles, [unbound]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.accountCount, 1);
});

test("writer 至少帮别人写过一篇才入选，入选后统计本人当月全部文案", () => {
  const writerOwn: CollaborationAccount = { id: "account-w", name: "文案自己号", profile_id: "writer-1" };
  const rows = [
    report({ id: "w-self", account_id: "account-w", script_author_user_id: "writer-1" }),
    report({ id: "w-other", script_author_user_id: "writer-1" }),
  ];

  const result = buildStaff(rows, "writer", profiles, [...accounts, writerOwn]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 2);
  assert.deepEqual(result[0]?.involvedAccounts.map((account) => account.accountId).sort(), ["account-1", "account-w"]);
  assert.deepEqual(result[0]?.works.map((work) => work.reportId).sort(), ["w-other", "w-self"]);
});

test("writer 只给自己账号写文案时不进入文案岗", () => {
  const writerOwn: CollaborationAccount = { id: "account-w", name: "文案自己号", profile_id: "writer-1" };
  const rows = [
    report({ id: "w-self", account_id: "account-w", script_author_user_id: "writer-1" }),
  ];

  assert.deepEqual(buildStaff(rows, "writer", profiles, [writerOwn]), []);
});

test("editor 只统计帮别人剪辑的作品", () => {
  const editorOwn: CollaborationAccount = { id: "account-e", name: "剪辑自己号", profile_id: "writer-1" };
  const rows = [
    report({ id: "e-self", account_id: "account-e", video_editor_user_id: "writer-1" }),
    report({ id: "e-other", video_editor_user_id: "writer-1" }),
  ];

  const result = buildStaff(rows, "editor", profiles, [...accounts, editorOwn]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.reportCount, 1);
  assert.deepEqual(result[0]?.works.map((work) => work.reportId), ["e-other"]);
});

test("staff 在空归属月份返回空列表，并返回全部负责账号", () => {
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
  assert.equal(result[0]?.involvedAccounts.length, 4);
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
  assert.deepEqual(result[0]?.works.map((work) => work.title), ["第二条作品", "第一条作品"]);
});

test("staff 返回当月全部篇目，不把第 4 篇以后藏掉", () => {
  const rows = Array.from({ length: 5 }, (_, index) =>
    report({
      id: `writer-work-${index + 1}`,
      report_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      title: `第${index + 1}篇`,
      script_author_user_id: "writer-1",
    }),
  );

  const result = buildStaff(rows, "writer", profiles, accounts);

  assert.equal(result[0]?.recentWorks.length, 3);
  assert.equal(result[0]?.works.length, 5);
  assert.deepEqual(result[0]?.works.map((work) => work.title), ["第5篇", "第4篇", "第3篇", "第2篇", "第1篇"]);
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

test("self 范围的岗位页只返回当前成员的岗位统计", () => {
  const currentRows = [
    report({
      id: "self-role",
      user_id: "owner-1",
      account_id: "account-1",
      script_author_user_id: "owner-1",
      video_editor_user_id: "writer-1",
      operator_user_id: "owner-1",
    }),
    report({
      id: "self-operator",
      user_id: "owner-1",
      account_id: "account-2",
      operator_user_id: "owner-1",
    }),
    report({
      id: "other-report",
      user_id: "owner-2",
      script_author_user_id: "writer-1",
      video_editor_user_id: "operator-1",
      operator_user_id: "operator-1",
    }),
  ];

  const pageData = buildCollaborationPageData(
    { currentRows, previousRows: [], profiles, accounts },
    null,
    "owner-1",
  );

  assert.deepEqual(pageData.operators.map((row) => row.userId), ["owner-1"]);
  assert.deepEqual(pageData.staff, []);
  assert.deepEqual(pageData.talents.map((row) => row.userId), ["owner-1"]);
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
    order(...args: unknown[]) { calls.push(["order", ...args]); return this; },
    range() { return Promise.resolve({ data: [], error: null }); },
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

test("日报聚合查询超过 Supabase 单页上限时会继续分页，避免历史样本静默截断", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => report({ id: `page-1-${index}` }));
  const secondPage = [report({ id: "page-2-1", report_date: "2026-08-02" })];
  const requestedRanges: Array<[number, number]> = [];
  const supabase = {
    from() {
      const builder = {
        select() { return this; },
        in() { return this; },
        gte() { return this; },
        lte() { return this; },
        order() { return this; },
        range(from: number, to: number) {
          requestedRanges.push([from, to]);
          return Promise.resolve({
            data: from === 0 ? firstPage : secondPage,
            error: null,
          });
        },
      };
      return builder;
    },
  };

  const rows = await queryScopedReports({
    supabase: supabase as never,
    visibleUserIds: ["owner-1"],
    start: "2026-08-01",
    end: "2026-08-31",
  });

  assert.equal(rows.length, 1001);
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  assert.equal(rows.at(-1)?.id, "page-2-1");
});

test("共享岗位数据集的 previousRows 只包含紧邻上月，historyRows 才包含更早样本", async () => {
  const rows = [
    report({ id: "old", report_date: "2026-07-27" }),
    report({ id: "previous", report_date: "2026-08-15" }),
    report({ id: "current", report_date: "2026-09-02" }),
  ];
  const builder = {
    select() { return this; },
    in() { return this; },
    gte() { return this; },
    lte() { return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: rows, error: null }); },
  };
  const supabase = {
    from(table: string) {
      if (table === "daily_reports") return builder;
      return {
        select() { return this; },
        in() { return Promise.resolve({ data: [], error: null }); },
      };
    },
  };
  const dataset = await loadCollaborationMonthDataset({
    supabase: supabase as never,
    visibleUserIds: ["owner-1"],
    range: { year: 2026, month: 9, start: "2026-09-01", end: "2026-09-30" },
  });
  assert.deepEqual(dataset.previousRows.map((row) => row.id), ["previous"]);
  assert.deepEqual(dataset.historyRows?.map((row) => row.id), ["old", "previous", "current"]);
});
