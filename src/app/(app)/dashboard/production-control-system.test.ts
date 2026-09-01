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

test("行动中枢改判后 dashboard 监听 FULFILLMENT 事件并刷新服务端数据", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/dashboard/production-control-system.tsx"),
    "utf8",
  );

  assert.match(source, /FULFILLMENT_DATA_CHANGED_EVENT/);
  assert.match(source, /detail\?\.source === "command-hub"/);
  assert.match(source, /router\.refresh\(\)/);
});

test("履约工作台同样监听 command-hub 改判事件刷新可见日历", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/fulfillment/fulfillment-workbench.tsx"),
    "utf8",
  );

  assert.match(source, /FULFILLMENT_DATA_CHANGED_EVENT/);
  assert.match(source, /detail\?\.source === "command-hub"/);
  assert.match(source, /refreshVisibleCalendar\(\)/);
});
