import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Rewrite 主流程使用 /api/rewrite 前缀，旧 content-tools 路径保留兼容", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/content-tools/rewrite-v3/useRewriteV3Logic.ts"), "utf8");
  assert.match(source, /\/api\/rewrite\/conversations\/\$\{conversationId\}\/messages/);
  assert.match(source, /fetch\('\/api\/rewrite\/bootstrap'/);
  assert.doesNotMatch(source, /fetch\('\/api\/content-tools\/rewrite\/bootstrap'/);
  assert.doesNotMatch(source, /fetch\(`\/api\/content-tools\/rewrite\/conversations/);
});
