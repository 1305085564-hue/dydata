import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("账号查询失败时阻止渲染空表单并提供重试", () => {
  const source = readFileSync(new URL("./submit-container.tsx", import.meta.url), "utf8");

  assert.match(source, /error: accountsError/);
  assert.match(source, /if \(accountsError\)[\s\S]*<ErrorState/);
  assert.match(source, /title="账号加载失败"/);
});
