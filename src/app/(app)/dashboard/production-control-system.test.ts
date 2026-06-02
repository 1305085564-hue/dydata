import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("dashboard 成员工作台不再挂载页内今日聚焦卡", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/dashboard/production-control-system.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /FocusHeroCard/);
  assert.doesNotMatch(source, /今日聚焦/);
  assert.doesNotMatch(source, /今日节奏/);
});
