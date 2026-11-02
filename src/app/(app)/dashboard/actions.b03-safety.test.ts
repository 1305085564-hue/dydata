import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("B03 日报账号归属门禁先于飞书发送，使用隔离的本地桩", () => {
  const probePath = fileURLToPath(new URL("./actions.b03-safety-probe.mjs", import.meta.url));
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
  const receiptLine = output.split(/\r?\n/).find((line) => line.startsWith("B03_DAILY_REPORT_FEISHU_RECEIPT="));
  assert.ok(receiptLine, `missing daily report completion receipt\n${output}`);
  const receipt = JSON.parse(receiptLine.slice("B03_DAILY_REPORT_FEISHU_RECEIPT=".length));
  assert.deepEqual(receipt, {
    unauthenticated: { error: "请先登录", serverClientCalls: 1, adminClientCalls: 0, accountReads: 0, reportWrites: 0, feishuStubCalls: 0 },
    wrongOwner: { status: "rejected", serverClientCalls: 1, adminClientCalls: 0, accountReads: 1, profileReads: 0, reportWrites: 0, feishuStubCalls: 0 },
    ownedReportPositive: { status: "success", serverClientCalls: 1, adminClientCalls: 0, accountReads: 1, profileReads: 1, reportWrites: 1, feishuStubCalls: 1 },
  });
});
