import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./user-workspace-popover.tsx", import.meta.url),
  "utf8",
);

test("无成员管理权限时不再无条件显示成员与团队架构链接", () => {
  assert.match(source, /canAccessTeamManagement \? \(/);
  assert.match(source, /需权限/);
});

test("有成员管理权限时仍保留成员与团队架构链接", () => {
  assert.match(source, /<a[\s\S]*href="\/admin\/modules"/);
  assert.doesNotMatch(source, /import Link from "next\/link"/);
});
