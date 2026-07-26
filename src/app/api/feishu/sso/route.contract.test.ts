import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("飞书 SSO 从认证账号读取邮箱，而不是 profiles 表", () => {
  assert.doesNotMatch(source, /\.select\("id, name, email, role"\)/);
  assert.match(source, /auth\.admin\.getUserById\(profile\.id\)/);
});
