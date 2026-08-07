import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { filterExportViolationRows } from "./route";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

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

test("红灯名单导出不再接收小组筛选或输出小组列", () => {
  assert.doesNotMatch(routeSource, /group_id|group_name|p_group_id/i);
  assert.doesNotMatch(routeSource, /小组/);
});
