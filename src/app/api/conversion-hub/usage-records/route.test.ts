import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildUsageRecordsListResponse } from "./route";

test("话术使用记录按当前业务可见成员范围过滤", async () => {
  const filters: Array<{ column: string; values: unknown[] }> = [];
  const query = {
    order() { return this; },
    range() { return this; },
    eq() { return this; },
    in(column: string, values: unknown[]) {
      filters.push({ column, values });
      return this;
    },
    then(resolve: (value: unknown) => void) {
      resolve({ data: [], error: null, count: 0 });
    },
  };

  const response = await buildUsageRecordsListResponse(
    new NextRequest("https://dydata.cc/api/conversion-hub/usage-records"),
    {
      getAuthenticatedContext: async () => ({ user: { id: "leader-1" } }),
      getPermissionContext: async () => ({ scope: { kind: "team", visibleUserIds: ["leader-1", "member-1"] } }),
      createAdminClient: () => ({ from: () => ({ select: () => query }) }),
      createUsageRecordForUser: async () => ({ ok: true, data: {} }),
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(filters, [
    { column: "recorded_by", values: ["leader-1", "member-1"] },
  ]);
});
