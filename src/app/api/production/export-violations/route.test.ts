import assert from "node:assert/strict";
import test from "node:test";

import { filterExportViolationRows } from "./route";

test("红灯名单导出只保留当前管理范围内的成员", () => {
  const rows = [
    { user_id: "member-1", alert_level: "red" },
    { user_id: "member-2", alert_level: "red" },
    { user_id: "member-1", alert_level: "yellow" },
  ];

  const scoped = filterExportViolationRows(
    { kind: "team", visibleUserIds: ["leader-1", "member-1"] } as never,
    rows as never,
  );
  assert.deepEqual(scoped.map((row) => row.user_id), ["member-1"]);

  const owner = filterExportViolationRows(
    { kind: "all", visibleUserIds: [] } as never,
    rows as never,
  );
  assert.deepEqual(owner.map((row) => row.user_id), ["member-1", "member-2"]);
});
