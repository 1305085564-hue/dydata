import test from "node:test";
import assert from "node:assert/strict";

import { loadDashboardActivityData } from "./dashboard-activity";

type QueryResult = { data: unknown[] };

function createQueryResult(data: unknown[]): QueryResult & Record<string, unknown> {
  const result: QueryResult & Record<string, unknown> = { data };
  result.eq = () => result;
  result.in = () => result;
  result.gte = () => result;
  result.lte = () => result;
  result.order = () => result;
  result.limit = () => result;
  return result;
}

test("loadDashboardActivityData skips report queries when the user has no accounts", async () => {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return createQueryResult([]);
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await loadDashboardActivityData({ supabase: supabase as never, userId: "user-1" });

  assert.deepEqual(result, { monthSubmittedDates: [], monthReports: [], history: [] });
  assert.deepEqual(calls, ["accounts"]);
});

test("loadDashboardActivityData returns only account-linked reports", async () => {
  const report = {
    id: "report-1",
    account_id: "account-1",
    title: "作品",
    report_date: "2026-05-05",
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
    uploaded_at: "2026-05-05T01:00:00Z",
  };
  const results = [
    [{ id: "account-1" }],
    [report],
    [{ report_date: "2026-05-05" }, { report_date: "2026-05-05" }, { report_date: null }],
    [report, { ...report, id: "report-2", account_id: null }],
  ];
  let queryIndex = 0;
  const supabase = {
    from() {
      return {
        select() {
          return createQueryResult(results[queryIndex++] ?? []);
        },
      };
    },
  };

  const result = await loadDashboardActivityData({ supabase: supabase as never, userId: "user-1" });

  assert.deepEqual(result.monthSubmittedDates, ["2026-05-05"]);
  assert.deepEqual(result.history, [report]);
  assert.deepEqual(result.monthReports, [report]);
});
