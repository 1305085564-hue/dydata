import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  loadRecentExemptionReviewNotices,
  type ReviewNoticeDailyRow,
  type ReviewNoticeRequestRow,
} from "@/lib/loaders/dashboard-exemption-review";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20261127110000_decouple_exemption_date_rls_from_group_mode.sql",
);

const NOW = new Date("2026-11-27T04:00:00Z");

test("C8 解耦迁移：创建 2 参作用域函数并用其重建逐日审批读策略，不依赖集团模式旧函数", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  assert.match(
    sql,
    /create or replace function public\.exemption_target_in_active_scope\(\s*p_actor_id uuid,\s*p_target_id uuid\s*\)/i,
  );
  assert.match(sql, /from public\.active_visible_user_ids\(p_actor_id\)/i);
  assert.match(
    sql,
    /grant execute on function public\.exemption_target_in_active_scope\(uuid, uuid\) to authenticated, service_role/i,
  );

  assert.match(
    sql,
    /drop policy if exists "成员或管理员读取申请日期明细" on public\.exemption_request_date/i,
  );
  const policyMatch = sql.match(
    /create policy "成员或管理员读取申请日期明细"[\s\S]*?;\s*/i,
  );
  assert.ok(policyMatch, "缺少重建后的读策略定义");
  const policySql = policyMatch[0];

  assert.match(policySql, /r\.applicant_user_id = auth\.uid\(\)/i);
  assert.match(
    policySql,
    /public\.exemption_target_in_active_scope\(auth\.uid\(\), r\.applicant_user_id\)/i,
  );
  assert.doesNotMatch(
    policySql,
    /exemption_target_in_active_scope\([^)]*,[^)]*,/i,
    "策略绝不能再调用 3 参旧函数",
  );
  assert.doesNotMatch(
    policySql,
    /is_group_mode_active|group_mode/i,
    "策略绝不能依赖集团模式函数",
  );
});

test("C8 行为验证：员工读取近 7 天审批结果横幅可同时拿到部分通过、通过、驳回与驳回理由", async () => {
  const recentAt = "2026-11-26T08:00:00Z";
  const requests: ReviewNoticeRequestRow[] = [
    {
      id: "req-approved",
      request_status: "approved",
      exemption_type: "single",
      exemption_category: "leave",
      start_date: "2026-11-25",
      end_date: "2026-11-25",
      reason: "病假",
      reviewed_at: recentAt,
      created_at: "2026-11-24T08:00:00Z",
    },
    {
      id: "req-rejected",
      request_status: "rejected",
      exemption_type: "single",
      exemption_category: "waive",
      start_date: "2026-11-24",
      end_date: "2026-11-24",
      reason: "设备维护",
      reviewed_at: recentAt,
      created_at: "2026-11-23T08:00:00Z",
    },
    {
      id: "req-partial",
      request_status: "pending",
      exemption_type: "range",
      exemption_category: "leave",
      start_date: "2026-11-26",
      end_date: "2026-11-28",
      reason: "家中事务",
      reviewed_at: null,
      created_at: "2026-11-25T08:00:00Z",
    },
  ];
  const dailyRows: ReviewNoticeDailyRow[] = [
    {
      request_id: "req-approved",
      request_date: "2026-11-25",
      status: "approved",
      feedback: null,
      reviewed_by: "admin-1",
      reviewed_at: recentAt,
    },
    {
      request_id: "req-rejected",
      request_date: "2026-11-24",
      status: "rejected",
      feedback: "当天需正常交稿",
      reviewed_by: "admin-1",
      reviewed_at: recentAt,
    },
    {
      request_id: "req-partial",
      request_date: "2026-11-26",
      status: "approved",
      feedback: null,
      reviewed_by: "admin-1",
      reviewed_at: recentAt,
    },
    {
      request_id: "req-partial",
      request_date: "2026-11-27",
      status: "rejected",
      feedback: "27日排班紧张不可请假",
      reviewed_by: "admin-1",
      reviewed_at: recentAt,
    },
    {
      request_id: "req-partial",
      request_date: "2026-11-28",
      status: "pending",
      feedback: null,
      reviewed_by: null,
      reviewed_at: null,
    },
  ];

  const supabase = {
    from(table: string) {
      let statusFilter: string[] | null = null;
      let requestIdsFilter: string[] | null = null;
      const builder = {
        select() { return builder; },
        eq(col: string, value: string) {
          if (col === "request_status") statusFilter = [value];
          return builder;
        },
        in(col: string, values: string[]) {
          if (col === "request_status") statusFilter = values;
          if (col === "request_id") requestIdsFilter = values;
          return builder;
        },
        gte() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolveResult: (value: { data: unknown; error: null }) => void) {
          if (table === "exemption_request") {
            const matched = requests.filter((row) => !statusFilter || statusFilter.includes(row.request_status));
            return resolveResult({ data: matched, error: null });
          }
          if (table === "exemption_request_date") {
            const matched = dailyRows.filter((row) => !requestIdsFilter || requestIdsFilter.includes(row.request_id));
            return resolveResult({ data: matched, error: null });
          }
          return resolveResult({ data: [], error: null });
        },
      };
      return builder;
    },
  };

  const notices = await loadRecentExemptionReviewNotices(supabase as never, "emp-1", NOW);
  assert.equal(notices.length, 3);
  const byId = new Map(notices.map((item) => [item.id, item]));
  assert.equal(byId.get("req-approved")?.daily_results?.[0]?.status, "approved");
  assert.equal(byId.get("req-rejected")?.daily_results?.[0]?.status, "rejected");
  assert.equal(byId.get("req-rejected")?.daily_results?.[0]?.feedback, "当天需正常交稿");
  assert.deepEqual(
    byId.get("req-partial")?.daily_results?.map((item) => [item.date, item.status, item.feedback]),
    [
      ["2026-11-26", "approved", null],
      ["2026-11-27", "rejected", "27日排班紧张不可请假"],
      ["2026-11-28", "pending", null],
    ],
  );
});
