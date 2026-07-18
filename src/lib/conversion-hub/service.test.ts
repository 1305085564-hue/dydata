import assert from "node:assert/strict";
import test from "node:test";

import { canSeeAllUsageRecords, replaceDailyReportUsageRecord } from "./service";

type Action = "select" | "delete" | "insert";

test("replaceDailyReportUsageRecord 使用单个 RPC 替换旧记录，不先删除", async () => {
  const operations: string[] = [];

  class Query {
    private action: Action = "select";

    constructor(private readonly table: string) {}

    select() { this.action = "select"; return this; }
    delete() { this.action = "delete"; operations.push(`${this.table}:delete`); return this; }
    insert() { this.action = "insert"; operations.push(`${this.table}:insert`); return this; }
    eq() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return this; }
    single() { return this; }

    then(resolve: (value: unknown) => void) {
      let result: { data: unknown; error: null };
      if (this.table === "profiles") {
        result = { data: { id: "user-1", role: "member", permissions: {}, team_id: "team-1", group_id: null }, error: null };
      } else if (this.table === "groups") {
        result = { data: [], error: null };
      } else if (this.table === "daily_reports") {
        result = { data: { id: "report-1", user_id: "user-1", account_id: "account-1" }, error: null };
      } else if (this.table === "accounts") {
        result = { data: { id: "account-1", name: "账号 A", profile_id: "user-1" }, error: null };
      } else if (this.table === "violation_cases") {
        result = { data: { id: "case-1", status: "verified", is_deleted: false }, error: null };
      } else if (this.table === "script_usage_records" && this.action === "select") {
        result = { data: [], error: null };
      } else {
        result = { data: { id: "usage-1" }, error: null };
      }
      return Promise.resolve(result).then(resolve);
    }
  }

  const supabase = {
    from(table: string) {
      return new Query(table);
    },
    rpc(name: string, params: Record<string, unknown>) {
      operations.push(`rpc:${name}`);
      return Promise.resolve({ data: [{ id: "usage-1", ...params }], error: null });
    },
  };

  const result = await replaceDailyReportUsageRecord(supabase as never, "user-1", {
    case_id: "case-1",
    script_text: null,
    script_format: "oral",
    account_id: "account-1",
    used_at: "2026-07-18",
    views: 100,
    follows: 5,
    source: "daily_report",
    daily_report_id: "report-1",
    note: null,
    result_flag: "pass",
  });

  assert.equal(result.ok, true);
  assert.equal(operations.includes("script_usage_records:delete"), false);
  assert.deepEqual(operations.filter((item) => item.startsWith("rpc:")), [
    "rpc:replace_daily_report_usage_record",
  ]);
});

test("替换记录缺 daily_report_id 时返回校验错误", async () => {
  const result = await replaceDailyReportUsageRecord({} as never, "user-1", {
    daily_report_id: null,
  } as never);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 422);
});

test("用户资料缺失时不能查看全部记录", async () => {
  const query = {
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: null, error: { message: "missing" } }),
  };
  const supabase = { from: () => query };
  assert.equal(await canSeeAllUsageRecords(supabase as never, "user-1"), false);
});
