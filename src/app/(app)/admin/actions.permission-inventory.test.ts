import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

// 权限清点跑在隔离子进程里：需要 --experimental-test-module-mocks 把权限与数据库都换成桩，
// 断言的是"调用行为"（每个操作被拦下、没碰库），不读源码文本。
test("管理后台写操作的权限清点：没有权限的操作全部被拦下且不碰数据库", () => {
  const probePath = fileURLToPath(new URL("./actions.permission-inventory.probe.mjs", import.meta.url));
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", "--test", "--test-reporter=spec", probePath],
    { cwd: process.cwd(), encoding: "utf8", timeout: 60_000, env: childEnv },
  );

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
