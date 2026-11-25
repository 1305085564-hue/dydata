import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** 容器把统一解析的可见范围交给当前页签 loader；loader 内的收窄与候选容错由 workbench-loader.test.ts 行为测试覆盖。 */
const containerSource = readFileSync(
  new URL("./collaboration-data-container.tsx", import.meta.url),
  "utf8",
);

test("容器把统一解析后的可见范围交给当前页签 loader", () => {
  assert.match(containerSource, /resolveCollaborationScope\(supabase, context\.scope\)/);
  assert.match(containerSource, /visibleUserIds: resolution\.visibleUserIds/);
  assert.match(containerSource, /activeVisibleUserIds: context\.scope\.activeVisibleUserIds/);
  assert.match(containerSource, /restrictToSelf,/);
  assert.match(containerSource, /userId: context\.scope\.userId/);
});
