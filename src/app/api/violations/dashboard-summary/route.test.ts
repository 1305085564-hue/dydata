import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardSummaryResponse } from "./route";

type DashboardQueryRow = Record<string, unknown>;

type DashboardMockQuery = {
  table: string;
  selectQuery: string;
  filters: Array<{ kind: "eq" | "gte"; column: string; value: unknown }>;
  inFilters: Array<{ column: string; values: string[] }>;
  orderings: Array<{ column: string; ascending: boolean }>;
  limitValue: number | null;
};

function createDashboardSummarySupabase(rowsByTable: Record<string, DashboardQueryRow[]>) {
  return {
    from(table: string) {
      const state: DashboardMockQuery = {
        table,
        selectQuery: "",
        filters: [],
        inFilters: [],
        orderings: [],
        limitValue: null,
      };

      const execute = async () => {
        let rows = (rowsByTable[state.table] ?? []).slice();

        for (const filter of state.filters) {
          if (filter.kind === "eq") {
            rows = rows.filter((row) => row[filter.column] === filter.value);
          }
          if (filter.kind === "gte") {
            rows = rows.filter((row) => String(row[filter.column] ?? "") >= String(filter.value));
          }
        }

        for (const filter of state.inFilters) {
          rows = rows.filter((row) => filter.values.includes(String(row[filter.column] ?? "")));
        }

        for (const ordering of [...state.orderings].reverse()) {
          rows.sort((left, right) => {
            const leftValue = left[ordering.column];
            const rightValue = right[ordering.column];
            if (leftValue == null && rightValue == null) return 0;
            if (leftValue == null) return 1;
            if (rightValue == null) return -1;
            if (leftValue < rightValue) return ordering.ascending ? -1 : 1;
            if (leftValue > rightValue) return ordering.ascending ? 1 : -1;
            return 0;
          });
        }

        if (state.limitValue != null) {
          rows = rows.slice(0, state.limitValue);
        }

        if (state.selectQuery === "id" && state.filters.some((item) => item.kind === "gte")) {
          return { data: null, error: null, count: rows.length };
        }

        return { data: rows, error: null, count: rows.length };
      };

      const builder = {
        select(query: string) {
          state.selectQuery = query;
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ kind: "eq", column, value });
          return builder;
        },
        in(column: string, values: string[]) {
          state.inFilters.push({ column, values });
          return builder;
        },
        gte(column: string, value: unknown) {
          state.filters.push({ kind: "gte", column, value });
          return builder;
        },
        order(column: string, options: { ascending: boolean }) {
          state.orderings.push({ column, ascending: options.ascending });
          return builder;
        },
        limit(value: number) {
          state.limitValue = value;
          return builder;
        },
        then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
          return execute().then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

test("dashboard summary 返回 conversionTop3", async () => {
  const response = await buildDashboardSummaryResponse({
    getAuthenticatedContext: async () => ({ user: { id: "owner-1" } }),
    createAdminClient: () =>
      createDashboardSummarySupabase({
        videos: [
          {
            id: "video-danger-1",
            content: "视频异常 1",
            anomaly_status: "abnormal",
            punish_type: "limited",
            created_at: "2026-05-26T09:00:00.000Z",
            uploaded_at: "2026-05-26T10:00:00.000Z",
          },
        ],
        violation_cases: [
          {
            id: "danger-1",
            script_text: "危险 1",
            pass_count: 0,
            fail_count: 3,
            is_deleted: false,
            purpose: "violation",
            status: "verified",
            created_at: "2026-05-26T09:00:00.000Z",
            reviewed_at: "2026-05-26T10:00:00.000Z",
            risk_level: "high",
            submitter: { name: "张三" },
          },
          {
            id: "safe-1",
            script_text: "安全 1",
            pass_count: 9,
            fail_count: 1,
            is_deleted: false,
            purpose: "violation",
            status: "verified",
            created_at: "2026-05-26T09:30:00.000Z",
            reviewed_at: "2026-05-26T11:00:00.000Z",
            risk_level: "low",
            submitter: { name: "李四" },
          },
          {
            id: "conv-1",
            script_text: "转化 1",
            total_views: 1000,
            total_follows: 52,
            usage_count: 8,
            weighted_conversion_rate: 0.052,
            is_deleted: false,
            purpose: "conversion",
            status: "verified",
            created_at: "2026-05-25T09:00:00.000Z",
          },
          {
            id: "conv-2",
            script_text: "转化 2",
            total_views: 800,
            total_follows: 24,
            usage_count: 4,
            weighted_conversion_rate: 0.03,
            is_deleted: false,
            purpose: "conversion",
            status: "verified",
            created_at: "2026-05-25T10:00:00.000Z",
          },
        ],
      }),
  });

  const json = await response.json();
  assert.deepEqual(json.data.conversionTop3, [
    {
      id: "conv-1",
      script_text: "转化 1",
      conversion_rate: "5.20%",
      usage_count: 8,
    },
    {
      id: "conv-2",
      script_text: "转化 2",
      conversion_rate: "3.00%",
      usage_count: 4,
    },
  ]);
});
