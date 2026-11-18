import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function run(script, args = []) {
  return execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8" });
}

test("预发布脚本 dry-run 固化全部门禁顺序", () => {
  const result = JSON.parse(run("preflight-release.mjs", ["--dry-run"]));
  assert.deepEqual(result.steps.map((step) => step.id), [
    "migration-scope", "screenshot-storage-boundary", "scripts-tests", "unit-tests", "typecheck", "lint", "build",
    "roles", "browser",
  ]);
});

test("故障注入默认只输出本地/预览演练步骤", () => {
  const result = JSON.parse(run("fault-injection.mjs", ["--dry-run"]));
  assert.equal(result.target, "health:supabase-down");
  assert.deepEqual(result.steps.map((step) => step.id), ["inject", "recover"]);
});
