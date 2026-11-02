import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("B03 import parse/confirm 路由权限桩测在隔离子进程通过", () => {
  const probePath = fileURLToPath(new URL("./b03-auth-probe.mjs", import.meta.url));
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", "--test", "--test-reporter=spec", probePath],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000, env: childEnv },
  );

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = `${result.stdout}\n${result.stderr}`;
  const receiptLine = output.split(/\r?\n/).find((line) => line.startsWith("B03_IMPORT_AUTH_RECEIPT="));
  assert.ok(receiptLine, `missing child completion receipt\n${output}`);
  const receipt = JSON.parse(receiptLine.slice("B03_IMPORT_AUTH_RECEIPT=".length));
  assert.deepEqual(receipt, {
    parseDenied: { status: 403, adminClientCalls: 0, tableCalls: 0, writes: 0 },
    parsePositive: { status: 200, adminClientCalls: 1, tableCalls: 1, writes: 0 },
    confirmDenied: { status: 403, adminClientCalls: 0, tableCalls: 0, writes: 0 },
    confirmPositive: { status: 200, adminClientCalls: 1, topicWriteCalls: 1, batchWriteCalls: 1 },
  });
});
