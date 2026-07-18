import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("母题分类与我的认领失败时分别显示可重试提示", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(source, /topicsError/);
  assert.match(source, /claimsError/);
  assert.match(source, /母题分类加载失败/);
  assert.match(source, /认领状态加载失败/);
  assert.match(source, /重新加载分类/);
  assert.match(source, /重新加载认领状态/);
});
