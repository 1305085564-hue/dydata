import assert from "node:assert/strict";
import test from "node:test";

import { __internal, loadGrowthPageContract, loadGrowthPageData, loadGrowthPageHydrationData } from "./growth-page";

type QueryCall = {
  table: string;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  gte: Record<string, unknown>;
  contains: Record<string, unknown>;
  limit: number | null;
  single: boolean;
};

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

class FakeQuery {
  private eqFilters: Record<string, unknown> = {};
  private inFilters: Record<string, unknown[]> = {};
  private gteFilters: Record<string, unknown> = {};
  private containsFilters: Record<string, unknown> = {};
  private limitValue: number | null = null;
  private singleMode = false;

  constructor(
    private readonly table: string,
    private readonly calls: QueryCall[],
    private readonly resolver: (call: QueryCall) => QueryResult,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqFilters[column] = value;
    return this;
  }

  in(column: string, value: unknown[]) {
    this.inFilters[column] = value;
    return this;
  }

  gte(column: string, value: unknown) {
    this.gteFilters[column] = value;
    return this;
  }

  contains(column: string, value: unknown) {
    this.containsFilters[column] = value;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = true;
    return this;
  }

  then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
    const call: QueryCall = {
      table: this.table,
      eq: { ...this.eqFilters },
      in: { ...this.inFilters },
      gte: { ...this.gteFilters },
      contains: { ...this.containsFilters },
      limit: this.limitValue,
      single: this.singleMode,
    };
    this.calls.push(call);
    return Promise.resolve(this.resolver(call)).then(resolve, reject);
  }
}

function createFakeSupabase(resolver: (call: QueryCall) => QueryResult, calls: QueryCall[]) {
  return {
    from(table: string) {
      return new FakeQuery(table, calls, resolver);
    },
  };
}

function createReport(overrides: Record<string, unknown>) {
  return {
    user_id: "user-1",
    account_id: "acc-self",
    report_date: "2026-05-30",
    play_count: 20000,
    likes: 1000,
    comments: 120,
    shares: 60,
    favorites: 80,
    follower_gain: 20,
    completion_rate: "35%",
    completion_rate_5s: "48%",
    content: "开头先说结论，再补一个反常识案例。",
    ...overrides,
  };
}

test("成长页脚本字段缺失时不继续查询脚本文档和脚本分段", async () => {
  __internal.resetContentScriptSchemaCache();
  const calls: string[] = [];

  class MissingSchemaQuery {
    constructor(
      private readonly table: string,
      private readonly tableCalls: string[],
    ) {}

    select() {
      this.tableCalls.push(this.table);
      return this;
    }

    eq() {
      return this;
    }

    then(resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) {
      const result =
        this.table === "content_item"
          ? {
              data: null,
              error: {
                message: "Could not find the 'account_id' column of 'content_item' in the schema cache",
              },
            }
          : { data: [], error: null };

      return Promise.resolve(result).then(resolve);
    }
  }

  const result = await __internal.loadScriptContextData(
    {
      from(table: string) {
        return new MissingSchemaQuery(table, calls);
      },
    } as never,
    "user-1",
  );

  assert.deepEqual(result, {
    contentItems: [],
    scriptDocuments: [],
    scriptSegments: [],
  });
  assert.deepEqual(calls, ["content_item"]);
});

test("成长页 owner_user_id 缺列时按兼容降级，不误跑后续脚本链", async () => {
  __internal.resetContentScriptSchemaCache();
  const calls: string[] = [];

  class MissingOwnerColumnQuery {
    constructor(
      private readonly table: string,
      private readonly tableCalls: string[],
    ) {}

    select() {
      this.tableCalls.push(this.table);
      return this;
    }

    eq() {
      return this;
    }

    then(resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) {
      return Promise.resolve({
        data: null,
        error: {
          message: "Could not find the 'owner_user_id' column of 'content_item' in the schema cache",
        },
      }).then(resolve);
    }
  }

  const result = await __internal.loadScriptContextData(
    {
      from(table: string) {
        return new MissingOwnerColumnQuery(table, calls);
      },
    } as never,
    "user-1",
  );

  assert.deepEqual(result, {
    contentItems: [],
    scriptDocuments: [],
    scriptSegments: [],
  });
  assert.deepEqual(calls, ["content_item"]);
});

test("成长页脚本字段缺失会缓存兼容状态，下一次直接跳过脚本链路", async () => {
  const calls: string[] = [];

  class CachedQuery {
    constructor(
      private readonly table: string,
      private readonly tableCalls: string[],
    ) {}

    select() {
      this.tableCalls.push(this.table);
      return this;
    }

    eq() {
      return this;
    }

    then(resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) {
      return Promise.resolve({
        data: null,
        error: {
          message: "Could not find the 'account_id' column of 'content_item' in the schema cache",
        },
      }).then(resolve);
    }
  }

  __internal.resetContentScriptSchemaCache();
  await __internal.loadScriptContextData(
    {
      from(table: string) {
        return new CachedQuery(table, calls);
      },
    } as never,
    "user-1",
  );

  calls.length = 0;
  await __internal.loadScriptContextData(
    {
      from(table: string) {
        return new CachedQuery(table, calls);
      },
    } as never,
    "user-1",
  );

  assert.deepEqual(calls, []);
  __internal.resetContentScriptSchemaCache();
});

test("成长页 initial 模式避开全量账号和脚本重链路，但保留首屏核心数据", async () => {
  const calls: QueryCall[] = [];
  const now = new Date("2026-05-31T12:00:00.000Z");
  const myReports = [
    createReport({ report_date: "2026-05-30" }),
    createReport({ report_date: "2026-05-29", play_count: 18000, completion_rate: "33%", completion_rate_5s: "45%" }),
    createReport({ report_date: "2026-05-24", play_count: 22000, completion_rate: "37%", completion_rate_5s: "50%" }),
  ];
  const teamLightReports = [
    ...myReports,
    ...Array.from({ length: 6 }, (_, index) =>
      createReport({
        user_id: "user-2",
        account_id: "acc-peer",
        report_date: `2026-05-${String(18 + index).padStart(2, "0")}`,
        play_count: 36000 + index * 800,
        likes: 2200,
        comments: 240,
        shares: 120,
        favorites: 150,
        follower_gain: 48,
        completion_rate: "51%",
        completion_rate_5s: "66%",
        content: "同行高表现脚本样本",
      }),
    ),
  ];

  const supabase = createFakeSupabase((call) => {
    if (call.table === "profiles" && call.single) {
      return { data: { id: "user-1", name: "阿禅" }, error: null };
    }

    if (call.table === "accounts" && call.eq.profile_id === "user-1") {
      return {
        data: [
          {
            id: "acc-self",
            profile_id: "user-1",
            name: "我的账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
        ],
        error: null,
      };
    }

    if (call.table === "daily_reports" && call.eq.user_id === "user-1") {
      return { data: myReports, error: null };
    }

    if (call.table === "daily_reports" && !call.eq.user_id) {
      return { data: teamLightReports, error: null };
    }

    if (call.table === "profiles" && Array.isArray(call.in.id)) {
      return {
        data: [
          { id: "user-1", name: "阿禅" },
          { id: "user-2", name: "小王" },
        ],
        error: null,
      };
    }

    if (call.table === "ai_insight_result") {
      return { data: [], error: null };
    }

    return { data: [], error: null };
  }, calls);

  const result = await loadGrowthPageData({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    mode: "initial",
    now,
  });

  assert.equal(result.isPartial, true);
  assert.equal(result.loadMode, "initial");
  assert.equal(result.statusCards.length > 0, true);
  assert.equal(result.capabilityCards.length, 6);
  assert.equal(result.scriptBreakdown.state, "fallback");
  assert.equal(result.pkPanel, null);
  assert.deepEqual(result.teamMembers, []);
  assert.deepEqual(result.weakBenchmarkCards, []);
  assert.equal(result.teamReports.some((report) => (report as { submitter?: string }).submitter === "小王"), true);

  const queriedTables = calls.map((call) => call.table);
  assert.equal(queriedTables.includes("content_item"), false);
  assert.equal(queriedTables.includes("script_document"), false);
  assert.equal(queriedTables.includes("script_segment"), false);

  const accountsCalls = calls.filter((call) => call.table === "accounts");
  assert.equal(accountsCalls.length, 1);
  assert.deepEqual(accountsCalls[0]?.eq, { profile_id: "user-1" });

  const dailyReportDates = calls.filter((call) => call.table === "daily_reports").map((call) => call.gte.report_date);
  assert.deepEqual(dailyReportDates, ["2026-05-17"]);
});

test("成长页只有一条真实报告时绝不补造虚拟报告", async () => {
  const calls: QueryCall[] = [];
  const now = new Date("2026-05-31T12:00:00.000Z");
  const onlyRealReport = createReport({ report_date: "2026-05-30", play_count: 12345 });
  const supabase = createFakeSupabase((call) => {
    if (call.table === "profiles" && call.single) {
      return { data: { id: "user-1", name: "阿禅" }, error: null };
    }
    if (call.table === "accounts") {
      return {
        data: [{ id: "acc-self", profile_id: "user-1", name: "我的账号", content_direction: "财经", presentation_format: "口播" }],
        error: null,
      };
    }
    if (call.table === "daily_reports") {
      return { data: [onlyRealReport], error: null };
    }
    if (call.table === "profiles") {
      return { data: [{ id: "user-1", name: "阿禅" }], error: null };
    }
    if (call.table === "ai_insight_result") {
      return { data: [], error: null };
    }
    return { data: [], error: null };
  }, calls);

  const result = await loadGrowthPageData({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    mode: "initial",
    now,
  });

  assert.equal(result.reportCount, 1);
  assert.equal(result.myReports.length, 1);
  assert.equal(result.myReports[0]?.play_count, 12345);

  const contract = await loadGrowthPageContract({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    now,
  });

  assert.deepEqual(contract.identity, { profileName: "阿禅", accountCount: 1, reportCount: 1 });
  assert.equal(contract.credibility.level, "low");
  assert.equal("teamReports" in contract, false);
  assert.equal("myReports" in contract, false);
});

test("成长页 30 天指标概览不能被近 7 天窗口清零", async () => {
  const calls: QueryCall[] = [];
  const now = new Date("2026-05-31T12:00:00.000Z");
  const reports = [
    createReport({ report_date: "2026-05-10", play_count: 12000 }),
    createReport({ report_date: "2026-05-15", play_count: 18000 }),
  ];
  const supabase = createFakeSupabase((call) => {
    if (call.table === "accounts") {
      return {
        data: [{ id: "acc-self", profile_id: "user-1", name: "我的账号", content_direction: "财经", presentation_format: "口播" }],
        error: null,
      };
    }
    if (call.table === "daily_reports") {
      return { data: reports, error: null };
    }
    if (call.table === "profiles") {
      return { data: [{ id: "user-1", name: "阿禅" }], error: null };
    }
    return { data: [], error: null };
  }, calls);

  const contract = await loadGrowthPageContract({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    now,
  });

  const publishMetric = contract.metricsOverview.find((item) => item.label === "发布数");
  assert.equal(contract.identity.reportCount, 2);
  assert.equal(publishMetric?.value, 2);
});

test("成长页 full 模式会恢复 PK、团队对比和结构化脚本数据", async () => {
  __internal.resetContentScriptSchemaCache();
  const calls: QueryCall[] = [];
  const now = new Date("2026-05-31T12:00:00.000Z");
  const fullReports = [
    ...Array.from({ length: 6 }, (_, index) =>
      createReport({
        report_date: `2026-05-${String(25 + index).padStart(2, "0")}`,
        play_count: 16000 + index * 1000,
        completion_rate: "32%",
        completion_rate_5s: "45%",
      }),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      createReport({
        user_id: "user-2",
        account_id: "acc-peer",
        report_date: `2026-05-${String(18 + index).padStart(2, "0")}`,
        play_count: 42000 + index * 1200,
        likes: 2600,
        comments: 280,
        shares: 160,
        favorites: 210,
        follower_gain: 55,
        completion_rate: "54%",
        completion_rate_5s: "70%",
        content: "同行高表现内容",
      }),
    ),
  ];

  const supabase = createFakeSupabase((call) => {
    if (call.table === "profiles" && call.single) {
      return { data: { id: "user-1", name: "阿禅" }, error: null };
    }

    if (call.table === "accounts" && call.eq.profile_id === "user-1") {
      return {
        data: [
          {
            id: "acc-self",
            profile_id: "user-1",
            name: "我的账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
        ],
        error: null,
      };
    }

    if (call.table === "accounts" && Object.keys(call.eq).length === 0) {
      return {
        data: [
          {
            id: "acc-self",
            profile_id: "user-1",
            name: "我的账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
          {
            id: "acc-peer",
            profile_id: "user-2",
            name: "同行账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
        ],
        error: null,
      };
    }

    if (call.table === "daily_reports") {
      return { data: fullReports, error: null };
    }

    if (call.table === "profiles" && !call.single) {
      return {
        data: [
          { id: "user-1", name: "阿禅" },
          { id: "user-2", name: "小王" },
        ],
        error: null,
      };
    }

    if (call.table === "ai_insight_result") {
      return { data: [], error: null };
    }

    if (call.table === "content_item") {
      return {
        data: [{ id: "content-1", account_id: "acc-self", biz_date: "2026-05-30", owner_user_id: "user-1" }],
        error: null,
      };
    }

    if (call.table === "script_document") {
      return {
        data: [{ id: "doc-1", content_item_id: "content-1", raw_text: "先说结论，再给方法。", estimated_duration_sec: 38 }],
        error: null,
      };
    }

    if (call.table === "script_segment") {
      return {
        data: [
          {
            id: "seg-1",
            script_document_id: "doc-1",
            segment_type: "hook",
            segment_order: 1,
            content: "先抛反常识结论",
            start_sec: 0,
            end_sec: 4,
          },
          {
            id: "seg-2",
            script_document_id: "doc-1",
            segment_type: "core_point",
            segment_order: 2,
            content: "给出数据和做法",
            start_sec: 4,
            end_sec: 20,
          },
        ],
        error: null,
      };
    }

    return { data: [], error: null };
  }, calls);

  const result = await loadGrowthPageData({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    mode: "full",
    now,
  });

  assert.equal(result.isPartial, false);
  assert.equal(result.loadMode, "full");
  assert.equal(result.scriptBreakdown.state, "structured");
  assert.equal(result.contract.scriptBreakdown.state, "ok");
  assert.equal(result.contract.verdict?.source, "rule");
  assert.deepEqual(Object.keys(result.contract.benchmark.peer ?? {}).sort(), ["dimensionValue", "name", "scriptSnippet"]);
  assert.equal(result.pkPanel?.rightName, "小王");
  assert.equal(result.teamMembers.length, 1);
  assert.equal(result.weakBenchmarkCards.length, 2);
  assert.equal(result.teamReports.some((report) => (report as { submitter?: string }).submitter === "小王"), true);

  const queriedTables = calls.map((call) => call.table);
  assert.equal(queriedTables.includes("content_item"), true);
  assert.equal(queriedTables.includes("script_document"), true);
  assert.equal(queriedTables.includes("script_segment"), true);

  const hasFullAccountsQuery = calls.some((call) => call.table === "accounts" && Object.keys(call.eq).length === 0);
  assert.equal(hasFullAccountsQuery, true);
});

test("成长页 full 补拉返回页面关键升级字段，并收窄重复基础查询", async () => {
  __internal.resetContentScriptSchemaCache();
  const calls: QueryCall[] = [];
  const now = new Date("2026-05-31T12:00:00.000Z");
  const fullReports = [
    createReport({ report_date: "2026-05-30", play_count: 12000, completion_rate: "31%", completion_rate_5s: "43%" }),
    createReport({ report_date: "2026-05-21", play_count: 21000, completion_rate: "36%", completion_rate_5s: "49%" }),
    createReport({ report_date: "2026-05-08", play_count: 34000, completion_rate: "42%", completion_rate_5s: "58%" }),
    createReport({
      user_id: "user-2",
      account_id: "acc-peer",
      report_date: "2026-05-29",
      play_count: 42000,
      likes: 2600,
      comments: 280,
      shares: 160,
      favorites: 210,
      follower_gain: 55,
      completion_rate: "54%",
      completion_rate_5s: "70%",
      content: "同行高表现内容",
    }),
  ];

  const supabase = createFakeSupabase((call) => {
    if (call.table === "accounts") {
      return {
        data: [
          {
            id: "acc-self",
            profile_id: "user-1",
            name: "我的账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
          {
            id: "acc-peer",
            profile_id: "user-2",
            name: "同行账号",
            content_direction: "财经",
            presentation_format: "口播",
          },
        ],
        error: null,
      };
    }

    if (call.table === "daily_reports") {
      return { data: fullReports, error: null };
    }

    if (call.table === "profiles") {
      return {
        data: [
          { id: "user-1", name: "阿禅" },
          { id: "user-2", name: "小王" },
        ],
        error: null,
      };
    }

    if (call.table === "content_item") {
      return {
        data: [{ id: "content-1", account_id: "acc-self", biz_date: "2026-05-30", owner_user_id: "user-1" }],
        error: null,
      };
    }

    if (call.table === "script_document") {
      return {
        data: [{ id: "doc-1", content_item_id: "content-1", raw_text: "先说结论，再给方法。", estimated_duration_sec: 38 }],
        error: null,
      };
    }

    if (call.table === "script_segment") {
      return {
        data: [
          {
            id: "seg-1",
            script_document_id: "doc-1",
            segment_type: "hook",
            segment_order: 1,
            content: "先抛反常识结论",
            start_sec: 0,
            end_sec: 4,
          },
        ],
        error: null,
      };
    }

    return { data: [], error: null };
  }, calls);

  const result = await loadGrowthPageHydrationData({
    supabase: supabase as never,
    userId: "user-1",
    userEmail: "user@example.com",
    now,
  });

  assert.equal(result.isPartial, false);
  assert.equal(result.loadMode, "full");
  assert.equal(result.reportCount, 3);
  assert.equal(result.summary.hasEnoughData, true);
  assert.equal(typeof result.summary.weakestDimension, "string");
  assert.equal(result.statusCards.length > 0, true);
  assert.equal(result.capabilityCards.length, 6);
  assert.equal(result.myReports.length, 3);
  assert.equal(result.teamReports.length, 4);
  assert.equal(typeof result.advice.diagnosis, "string");
  assert.equal(Array.isArray(result.teamMembers), true);
  assert.equal(result.scriptBreakdown.state, "structured");
  assert.equal(result.weakBenchmarkCards.length > 0, true);
  assert.equal(result.pkPanel?.rightName, "小王");

  const accountsCalls = calls.filter((call) => call.table === "accounts");
  assert.equal(accountsCalls.length, 1);
  assert.deepEqual(accountsCalls[0]?.eq, {});

  assert.equal(calls.some((call) => call.table === "ai_insight_result"), false);
  assert.equal(calls.some((call) => call.table === "profiles" && call.single), false);
});
