import test from "node:test";
import assert from "node:assert/strict";

import { loadScriptsTab } from "./analytics";

type QueryRow = Record<string, unknown>;

type MockQueryState = {
  table: string;
  filters: Array<{ kind: "eq" | "gte"; column: string; value: unknown }>;
  orderings: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  limitValue: number | null;
  selectOptions?: { count?: "exact"; head?: boolean };
};

function createAnalyticsSupabase(rowsByTable: Record<string, QueryRow[]>) {
  return {
    from(table: string) {
      const state: MockQueryState = {
        table,
        filters: [],
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
            rows = rows.filter((row) => {
              const current = row[filter.column];
              if (typeof current === "number" && typeof filter.value === "number") {
                return current >= filter.value;
              }
              return String(current ?? "") >= String(filter.value);
            });
          }
        }

        for (const ordering of [...state.orderings].reverse()) {
          rows.sort((left, right) => {
            const leftValue = left[ordering.column];
            const rightValue = right[ordering.column];
            if (leftValue == null && rightValue == null) return 0;
            if (leftValue == null) return ordering.nullsFirst ? -1 : 1;
            if (rightValue == null) return ordering.nullsFirst ? 1 : -1;
            if (leftValue < rightValue) return ordering.ascending ? -1 : 1;
            if (leftValue > rightValue) return ordering.ascending ? 1 : -1;
            return 0;
          });
        }

        if (state.limitValue != null) {
          rows = rows.slice(0, state.limitValue);
        }

        return {
          data: state.selectOptions?.head ? null : rows,
          error: null,
          count: state.selectOptions?.count ? rows.length : null,
        };
      };

      const builder = {
        select(_query: string, options?: { count?: "exact"; head?: boolean }) {
          state.selectOptions = options;
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ kind: "eq", column, value });
          return builder;
        },
        gte(column: string, value: unknown) {
          state.filters.push({ kind: "gte", column, value });
          return builder;
        },
        order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
          state.orderings.push({ column, ascending: options.ascending, nullsFirst: options.nullsFirst });
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

test("loadScriptsTab 聚合案例库 analytics 数据", async () => {
  const data = await loadScriptsTab("2026-05-26", {
    createAdminClient: () =>
      createAnalyticsSupabase({
        violation_cases: [
          {
            id: "conv-1",
            script_text: "转化脚本 1",
            purpose: "conversion",
            is_deleted: false,
            total_views: 2000,
            total_follows: 120,
            usage_count: 8,
            weighted_conversion_rate: 0.06,
          },
          {
            id: "conv-2",
            script_text: "转化脚本 2",
            purpose: "conversion",
            is_deleted: false,
            total_views: 1500,
            total_follows: 60,
            usage_count: 5,
            weighted_conversion_rate: 0.04,
          },
          {
            id: "conv-3",
            script_text: "低样本",
            purpose: "conversion",
            is_deleted: false,
            total_views: 800,
            total_follows: 50,
            usage_count: 2,
            weighted_conversion_rate: 0.08,
          },
          {
            id: "vio-1",
            script_text: "违规脚本",
            purpose: "violation",
            is_deleted: false,
            total_views: 0,
            total_follows: 0,
            usage_count: 0,
            weighted_conversion_rate: null,
          },
          {
            id: "deleted-1",
            script_text: "已删除",
            purpose: "conversion",
            is_deleted: true,
            total_views: 9999,
            total_follows: 999,
            usage_count: 99,
            weighted_conversion_rate: 0.99,
          },
        ],
        script_usage_records: [
          { id: "usage-1", used_at: "2026-05-26T10:00:00.000Z" },
          { id: "usage-2", used_at: "2026-05-27T10:00:00.000Z" },
          { id: "usage-3", used_at: "2026-05-20T10:00:00.000Z" },
        ],
      }),
  });

  assert.deepEqual(data.topScripts.map((row) => ({
    id: row.id,
    script_text: row.script_text,
    total_views: row.total_views,
    total_follows: row.total_follows,
    usage_count: row.usage_count,
    weighted_conversion_rate: row.weighted_conversion_rate,
  })), [
    {
      id: "conv-1",
      script_text: "转化脚本 1",
      total_views: 2000,
      total_follows: 120,
      usage_count: 8,
      weighted_conversion_rate: 0.06,
    },
    {
      id: "conv-2",
      script_text: "转化脚本 2",
      total_views: 1500,
      total_follows: 60,
      usage_count: 5,
      weighted_conversion_rate: 0.04,
    },
  ]);
  assert.equal(data.totalCases, 4);
  assert.equal(data.conversionCases, 3);
  assert.equal(data.usageCount, 15);
  assert.equal(data.totalViews, 4300);
  assert.equal(data.totalFollows, 230);
  assert.equal(data.averageConversionRate, 230 / 4300);
  assert.equal(data.weeklyNewUsageRecords, 2);
});
