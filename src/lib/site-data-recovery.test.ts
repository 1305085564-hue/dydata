import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("普通首次访问不触发清缓存跳转", () => {
  const source = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

  assert.doesNotMatch(source, /dydata-site-cleared/);
  assert.doesNotMatch(source, /!hasClearedSiteData/);
  assert.match(source, /if \(isClearSiteDataPass\)/);
});

test("显式清缓存完成后回到无恢复参数的网址", () => {
  const source = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

  assert.match(source, /searchParams\.delete\(CLEAR_SITE_DATA_QUERY\)/);
  assert.doesNotMatch(source, /searchParams\.set\(CLEAR_SITE_DATA_QUERY/);
});

