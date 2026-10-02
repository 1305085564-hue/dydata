import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();

function runBaseline(outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/architecture-baseline.mjs")], { cwd: root, env: { ...process.env, BASELINE_DATE: "2099-01-01", BASELINE_OUTPUT_DIR: outputDir } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`)));
  });
}

test("architecture baseline 可重复生成 JSON 和 Markdown，并包含固定预算", async () => {
  const outputDir = await mkdtemp(path.join(root, ".tmp-architecture-baseline-"));
  await runBaseline(outputDir);
  await access(path.join(outputDir, "architecture-baseline.json"));
  await access(path.join(outputDir, "architecture-baseline.md"));
  const result = JSON.parse(await readFile(path.join(outputDir, "architecture-baseline.json"), "utf8"));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.baselineDate, "2099-01-01");
  assert.ok(result.source.files > 0);
  assert.equal(result.runtime.pageBudgets["/dashboard"].firstScreenMs, 2000);
  assert.ok(Array.isArray(result.runtime.measurements));
  await rm(outputDir, { recursive: true, force: true });
});
