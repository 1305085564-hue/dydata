import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/migrate-screenshots-to-cos.mjs", "utf8");

test("截图迁移默认 dry-run，只有 execute 才允许写 COS", () => {
  assert.match(source, /const execute = process\.argv\.includes\("--execute"\)/);
  assert.match(source, /if \(!execute\)/);
  assert.match(source, /const CONCURRENCY = 6/);
  assert.match(source, /const RETRIES = 3/);
});

test("迁移下载时内联计算哈希，并保留断点和至少70张回读抽查", () => {
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /createHash\("md5"\)/);
  assert.match(source, /Math\.max\(70, Math\.ceil\(objects\.length \* 0\.02\)\)/);
  assert.match(source, /--resume/);
  assert.match(source, /manifest\.jsonl/);
  assert.match(source, /status === "source_missing"/);
  assert.match(source, /target_checksum_mismatch/);
});
