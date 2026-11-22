import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { REJECTION_GUIDANCE, runSourceTextTestGate } from "./source-text-test-gate.mjs";

const GATE_SCRIPT = path.resolve("scripts/source-text-test-gate.mjs");

function createTempProject(baselineFiles, testFiles) {
  const root = mkdtempSync(path.join(os.tmpdir(), "dydata-source-text-gate-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "src/lib"), { recursive: true });
  writeFileSync(
    path.join(root, "scripts/source-text-test-baseline.json"),
    JSON.stringify({ version: 1, files: baselineFiles }, null, 2),
  );
  for (const [relativePath, content] of Object.entries(testFiles)) {
    const fullPath = path.join(root, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return root;
}

test("存量未增长且行为测试与非源码测试正常放行", () => {
  const root = createTempProject(
    {
      "src/lib/legacy.test.ts": 3,
      "src/lib/removed.test.ts": 2,
    },
    {
      "src/lib/legacy.test.ts": [
        'import { readFileSync } from "node:fs";',
        'const src = readFileSync("src/lib/foo.ts", "utf8");',
        "assert.match(src, /a/);",
        "assert.doesNotMatch(src, /b/);",
      ].join("\n"),
      "src/lib/behavior.test.ts": [
        'import assert from "node:assert/strict";',
        "assert.equal(1 + 1, 2);",
      ].join("\n"),
      "src/lib/sql.test.ts": [
        'import { readFileSync } from "node:fs";',
        'const sql = readFileSync("supabase/migrations/001.sql", "utf8");',
        "assert.match(sql, /CREATE TABLE/);",
      ].join("\n"),
    },
  );

  try {
    const result = runSourceTextTestGate(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("名单外新增读源码测试文件时报错并给出整改指引", () => {
  const root = createTempProject(
    {},
    {
      "src/lib/new-source.test.tsx": [
        'import { readFileSync } from "node:fs";',
        'const src = readFileSync("src/components/button.tsx", "utf8");',
        "assert.match(src, /Button/);",
      ].join("\n"),
    },
  );

  try {
    const run = spawnSync(process.execPath, [GATE_SCRIPT], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /src\/lib\/new-source\.test\.tsx/);
    assert.ok(run.stderr.includes(REJECTION_GUIDANCE));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("名单内文件断言条数增加时报错，减少时通过", () => {
  const root = createTempProject(
    { "src/lib/legacy.test.ts": 1 },
    {
      "src/lib/legacy.test.ts": [
        'import { readFileSync } from "node:fs";',
        'const src = readFileSync("src/lib/foo.ts", "utf8");',
        "assert.match(src, /a/);",
        "assert.match(src, /b/);",
      ].join("\n"),
    },
  );

  try {
    const run = spawnSync(process.execPath, [GATE_SCRIPT], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /src\/lib\/legacy\.test\.ts.*1 -> 2/);
    assert.ok(run.stderr.includes(REJECTION_GUIDANCE));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
