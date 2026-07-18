import assert from "node:assert/strict";
import test from "node:test";

import { buildConversionEventsListResponse } from "./route";

test("转化违规事件按 reported_by 限定可见成员且不查询星号字段", async () => {
  const filters: Array<{ column: string; value: unknown }> = [];
  let selected = "";
  const query = {
    select(value: string) {
      selected = value;
      return this;
    },
    order() {
      return this;
    },
    range() {
      return this;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return this;
    },
    in(column: string, value: unknown) {
      filters.push({ column, value });
      return this;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
    },
  };

  const response = await buildConversionEventsListResponse(
    new Request("https://dydata.cc/api/conversion-hub/events") as never,
    {
      getAuthenticatedContext: async () => ({ user: { id: "leader-1" } }),
      getPermissionContext: async () => ({
        permissionInfo: { userId: "leader-1" },
        scope: { kind: "team", visibleUserIds: ["leader-1", "member-1"] },
      }) as never,
      createAdminClient: () => ({ from: () => query }) as never,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(selected.includes("*"), false);
  assert.deepEqual(filters, [{ column: "reported_by", value: ["leader-1", "member-1"] }]);
});
