import assert from "node:assert/strict";
import test from "node:test";

import { __internal, loadDashboardPageData } from "./dashboard-page";

type QueryCall = {
  table: string;
  columns: string;
  eqFilters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  orders: Array<[string, Record<string, unknown> | undefined]>;
  limitCount: number | null;
};

function createSupabaseMock() {
  const calls: QueryCall[] = [];

  function resolve(call: QueryCall) {
    if (call.table === "accounts") {
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

    if (call.table === "daily_reports") {
      return { data: [], error: null };
    }

    if (call.table === "exemption_grant") {
      return { data: [], error: null };
    }

    if (call.table === "exemption_request" && call.columns === "id") {
      return { data: [], error: null };
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
      };
    },
  };
}

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
