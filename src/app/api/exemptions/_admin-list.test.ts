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
