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
    "migration-scope", "scripts-tests", "unit-tests", "typecheck", "lint", "build",
    "maintainability", "roles", "browser", "architecture-baseline", "runtime-smoke",
  ]);
});

test("故障注入默认只输出本地/预览演练步骤", () => {
  const result = JSON.parse(run("fault-injection.mjs", ["--dry-run"]));
  assert.equal(result.target, "health:supabase-down");
  assert.deepEqual(result.steps.map((step) => step.id), ["inject", "recover"]);
});

test("回滚演练默认 dry-run，且生产步骤要求单步确认", () => {
  const result = JSON.parse(run("rollback-rehearsal.mjs"));
  assert.equal(result.mode, "dry-run");
  assert.equal(result.requiresSeparateProductionApproval, true);
  assert.ok(result.steps.some((step) => step.id === "promote-rollback"));
});
