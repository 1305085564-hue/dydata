import assert from "node:assert/strict";
import test from "node:test";

import { __internal, loadDashboardPageData } from "./dashboard-page";

type QueryCall = {
  table: string;
  columns: string;
  eqFilters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  gteFilters: Array<[string, unknown]>;
  lteFilters: Array<[string, unknown]>;
  orders: Array<[string, Record<string, unknown> | undefined]>;
  limitCount: number | null;
};

type MockResponse = { data: unknown; error: { message: string } | null };

type MockOptions = {
  accountResponses?: MockResponse[];
  reviewNotice?: unknown;
};

function createSupabaseMock(
  overrides: Partial<Record<string, MockResponse>> = {},
  options: MockOptions = {},
) {
  const calls: QueryCall[] = [];
  let accountQueryIndex = 0;

  function resolve(call: QueryCall) {
    if (overrides[call.table]) {
      return overrides[call.table];
    }

    if (call.table === "accounts") {
      const customResponse = options.accountResponses?.[accountQueryIndex];
      accountQueryIndex += 1;
      if (customResponse) return customResponse;
      return {
        data: [{ id: "account-1", name: "账号A", content_direction: "口播" }],
        error: null,
      };
    }

    if (call.table === "profiles") {
      return {
        data: {
          name: "测试成员",
          role: "admin",
          status: "active",
          exempt_type: null,
          exempt_start_date: null,
          exempt_end_date: null,
          exempt_reason: null,
          exemption_category: null,
        },
        error: null,
      };
    }

    if (call.table === "daily_reports" && call.columns === "report_date") {
      return {
        data: [
          { report_date: "2026-05-01" },
          { report_date: "2026-05-01" },
          { report_date: "2026-05-02" },
          { report_date: null },
        ],
        error: null,
      };
    }

    if (call.table === "daily_reports" && call.gteFilters.length > 0) {
      const latestReport = {
        id: "report-1",
        account_id: "account-1",
        title: "作品",
        report_date: "2026-05-02",
        play_count: 100,
        completion_rate: null,
        avg_play_duration: null,
        bounce_rate_2s: null,
        completion_rate_5s: null,
        likes: 1,
        comments: 2,
        shares: 3,
        favorites: 4,
        follower_gain: 5,
        follower_convert: null,
        content: null,
        published_at: null,
        uploaded_at: "2026-05-02T01:00:00Z",
      };
      return {
        data: [latestReport, { ...latestReport, id: "report-0", report_date: "2026-05-01" }],
        error: null,
      };
    }

    if (call.table === "daily_reports") {
      return {
        data: [
          {
            id: "report-1",
            account_id: "account-1",
            title: "作品",
            report_date: "2026-05-02",
            play_count: 100,
            completion_rate: null,
            avg_play_duration: null,
            bounce_rate_2s: null,
            completion_rate_5s: null,
            likes: 1,
            comments: 2,
            shares: 3,
            favorites: 4,
            follower_gain: 5,
            follower_convert: null,
            content: null,
            published_at: null,
            uploaded_at: "2026-05-02T01:00:00Z",
          },
        ],
        error: null,
      };
    }

    if (call.table === "exemption_grant") {
      return { data: [], error: null };
    }

    if (call.table === "exemption_request" && call.columns === "id") {
      return { data: [], error: null };
    }

    if (call.table === "exemption_request" && call.columns.startsWith("id, request_status")) {
      return { data: options.reviewNotice ?? null, error: null };
    }

    if (call.table === "exemption_request") {
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query: ${call.table} ${call.columns}`);
  }

  return {
    calls,
    from(table: string) {
      return {
        select(columns: string) {
          const call: QueryCall = {
            table,
            columns,
            eqFilters: [],
            inFilters: [],
            gteFilters: [],
            lteFilters: [],
            orders: [],
            limitCount: null,
          };
          calls.push(call);

          const chain = {
            eq(column: string, value: unknown) {
              call.eqFilters.push([column, value]);
              return chain;
            },
            in(column: string, values: unknown[]) {
              call.inFilters.push([column, values]);
              return chain;
            },
            gte(column: string, value: unknown) {
              call.gteFilters.push([column, value]);
              return chain;
            },
            lte(column: string, value: unknown) {
              call.lteFilters.push([column, value]);
              return chain;
            },
            order(column: string, options?: Record<string, unknown>) {
              call.orders.push([column, options]);
              return chain;
            },
            limit(count: number) {
              call.limitCount = count;
              return chain;
            },
            single() {
              return Promise.resolve(resolve(call));
            },
            maybeSingle() {
              return Promise.resolve(resolve(call));
            },
            then<TResult1 = Awaited<ReturnType<typeof resolve>>, TResult2 = never>(
              onfulfilled?:
                | ((value: Awaited<ReturnType<typeof resolve>>) => TResult1 | PromiseLike<TResult1>)
                | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) {
              return Promise.resolve(resolve(call)).then(onfulfilled, onrejected);
            },
          };

          return chain;
        },
        insert() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };
}

test("loadDashboardPageData 账号查询失败时抛错，不伪装成无账号", async () => {
  const supabase = createSupabaseMock({
    accounts: { data: null, error: { message: "accounts unavailable" } },
  });

  await assert.rejects(
    loadDashboardPageData({
      supabase: supabase as never,
      userId: "user-1",
    }),
    /加载账号失败/,
  );
});

test("dashboard profile 查询合同包含 role 且不使用通配符", () => {
  assert.equal(__internal.DASHBOARD_PROFILE_SELECT.includes("*"), false);
  assert.match(__internal.DASHBOARD_PROFILE_SELECT, /role/);
  assert.match(__internal.DASHBOARD_PROFILE_SELECT_FALLBACK, /role/);
});

test("loadDashboardPageData 首屏只查一次 profiles 且不再拉 team review requests", async () => {
  const supabase = createSupabaseMock();

  const result = await loadDashboardPageData({
    supabase: supabase as never,
    userId: "user-1",
  });

  const profileCalls = supabase.calls.filter((call) => call.table === "profiles");
  const exemptionRequestCalls = supabase.calls.filter((call) => call.table === "exemption_request");

  assert.equal(profileCalls.length, 1);
  assert.equal(profileCalls[0]?.columns, __internal.DASHBOARD_PROFILE_SELECT);
  assert.equal(exemptionRequestCalls.length, 2);
  assert.equal(result.userRole, "admin");
  assert.equal(result.userDisplayName, "测试成员");
  assert.equal("teamReviewRequests" in result, false);
});

test("loadDashboardPageData 会返回本月已提交日期并去重", async () => {
  const supabase = createSupabaseMock();

  const result = await loadDashboardPageData({
    supabase: supabase as never,
    userId: "user-1",
  });

  assert.deepEqual(result.monthSubmittedDates, ["2026-05-01", "2026-05-02"]);
});

test("loadDashboardPageData 首屏会返回本月日报，而不是空 monthReports", async () => {
  const supabase = createSupabaseMock();

  const result = await loadDashboardPageData({
    supabase: supabase as never,
    userId: "user-1",
  });

  assert.equal(result.monthReports.length, 2);
  assert.equal(result.monthReports.find((report) => report.id === "report-1")?.report_date, "2026-05-02");
});

test("默认账号创建成功后，本次请求重新查询并返回新账号", async () => {
  const supabase = createSupabaseMock({}, {
    accountResponses: [
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: "account-created", name: "测试成员", content_direction: null }], error: null },
    ],
  });

  const result = await loadDashboardPageData({
    supabase: supabase as never,
    userId: "user-1",
  });

  assert.deepEqual(result.accountIds, ["account-created"]);
  assert.equal(result.accounts[0]?.id, "account-created");
});

test("审批通过和拒绝通知都能到达首屏页面数据契约", async () => {
  for (const requestStatus of ["approved", "rejected"] as const) {
    const supabase = createSupabaseMock({}, {
      reviewNotice: {
        id: `request-${requestStatus}`,
        request_status: requestStatus,
        exemption_type: "temporary",
        exemption_category: requestStatus === "approved" ? "waive" : "leave",
        start_date: "2026-05-01",
        end_date: "2026-05-01",
        reason: "测试原因",
        reviewed_at: "2026-05-02T01:00:00Z",
        created_at: "2026-05-01T01:00:00Z",
      },
    });

    const result = await loadDashboardPageData({
      supabase: supabase as never,
      userId: "user-1",
    });

    assert.equal(result.userExemptionReviewNotice?.id, `request-${requestStatus}`);
    assert.equal(result.userExemptionReviewNotice?.request_status, requestStatus);
  }
});
