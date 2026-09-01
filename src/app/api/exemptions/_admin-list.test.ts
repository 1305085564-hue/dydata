import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminExemptionList } from "./_admin-list";

test("豁免管理列表在查询层按可见申请人过滤", async () => {
  const filters: Array<{ column: string; values: unknown[] }> = [];
  const query = {
    select() {
      return this;
    },
    in(column: string, values: unknown[]) {
      filters.push({ column, values });
      return this;
    },
    order() {
      return this;
    },
    async limit() {
      return { data: [], error: null };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: { from: () => query } as never,
    statuses: ["pending"],
    limit: 100,
    visibleUserIds: ["leader-1", "member-1"],
  });

  assert.deepEqual(result, { data: [] });
  assert.deepEqual(filters, [
    { column: "applicant_user_id", values: ["leader-1", "member-1"] },
    { column: "request_status", values: ["pending"] },
  ]);
});

test("豁免管理查询失败只向浏览器返回固定文案", async (t) => {
  t.mock.method(console, "error", () => {});
  const databaseError = { message: "relation public.secret_table does not exist" };
  const query = {
    select() { return this; },
    in() { return this; },
    order() { return this; },
    async limit() { return { data: null, error: databaseError }; },
  };

  const result = await loadAdminExemptionList({
    supabase: { from: () => query } as never,
    statuses: ["pending"],
    limit: 100,
    visibleUserIds: null,
  });

  assert.ok("response" in result);
  assert.equal(result.response.status, 500);
  assert.deepEqual(await result.response.json(), { error: "读取豁免申请列表失败" });
});

test("豁免列表查询携带 exemption_category 供待审/历史/行动中枢消费", async () => {
  let selectString = "";
  const query = {
    select(s: string) {
      selectString = s;
      return this;
    },
    in() { return this; },
    order() { return this; },
    async limit() {
      return {
        data: [{
          id: "req-1",
          applicant_user_id: "applicant-1",
          team_id: "team-1",
          exemption_type: "range",
          exemption_category: "leave",
          start_date: "2026-09-01",
          end_date: "2026-09-03",
          reason: "出差",
          request_status: "approved",
          reviewed_by: "reviewer-1",
          reviewed_at: "2026-09-01T08:00:00.000Z",
          created_at: "2026-08-31T08:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: {
      from: (table: string) => {
        if (table === "exemption_request") return query;
        if (table === "profiles") {
          return {
            select: () => ({ in: () => ({}) }),
          };
        }
        return { select: () => ({ in: () => ({}) }) };
      },
    } as never,
    statuses: ["approved", "rejected"],
    limit: 50,
    visibleUserIds: ["applicant-1"],
  });

  assert.match(selectString, /exemption_category/);
  if ("response" in result) throw new Error("expected data");
  assert.equal(result.data[0].exemption_category, "leave");
});
