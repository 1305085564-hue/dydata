import test from "node:test";
import assert from "node:assert/strict";

import { loadTeamOptions } from "./teams";

test("读取注册团队列表不会在 GET 链路创建默认团队", async () => {
  let inserted = false;
  const query = {
    select() { return this; },
    order: async () => ({ data: [{ id: "team-1", name: "深圳二部" }], error: null }),
    insert() {
      inserted = true;
      return this;
    },
  };

  const teams = await loadTeamOptions({ from: () => query } as never);
  assert.deepEqual(teams, [{ id: "team-1", name: "深圳二部" }]);
  assert.equal(inserted, false);
});
