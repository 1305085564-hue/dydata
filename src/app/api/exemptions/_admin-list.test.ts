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
