import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("日报-only 保存先核对登录与归属，再调用原子写入", () => {
  const probePath = fileURLToPath(new URL("./actions.daily-report-only-safety-probe.mjs", import.meta.url));
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
  const receiptLine = output.split(/\r?\n/).find((line) => line.startsWith("B03_DAILY_REPORT_EDIT_RECEIPT="));
  assert.ok(receiptLine, `missing daily report edit completion receipt\n${output}`);
  const receipt = JSON.parse(receiptLine.slice("B03_DAILY_REPORT_EDIT_RECEIPT=".length));
  assert.deepEqual(receipt, {
    unauthenticated: { error: "请先登录", serverClientCalls: 1, accountReads: 0, reportReads: 0, rpcCalls: 0 },
    wrongOwner: { status: "rejected", serverClientCalls: 1, accountReads: 1, reportReads: 1, profileReads: 0, rpcCalls: 0 },
    ownedReport: { status: "success", serverClientCalls: 1, accountReads: 1, reportReads: 1, profileReads: 1, rpcCalls: 1 },
  });
});
