import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("requireAdminContext/requireAdminActor 行为桩在隔离子进程通过", () => {
  const probePath = fileURLToPath(new URL("./admin-auth.behavior-probe.mjs", import.meta.url));
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", "--test", "--test-reporter=spec", probePath],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000, env: childEnv },
  );

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
