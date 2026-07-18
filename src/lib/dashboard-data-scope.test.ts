import test from "node:test";
import assert from "node:assert/strict";

import { filterLeaderboardByVisibleUsers } from "./dashboard-data-scope";

test("排行榜响应只保留当前业务范围内的成员", () => {
  const rows = [
    { account_id: "a1", profile_id: "user-1" },
    { account_id: "a2", profile_id: "user-2" },
    { account_id: "a3", profile_id: null },
  ];

  assert.deepEqual(filterLeaderboardByVisibleUsers(rows, ["user-1"]), [rows[0]]);
});
