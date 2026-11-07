import assert from "node:assert/strict";
import test from "node:test";

import { startDetectionRefresh } from "./use-ai-config";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("R4 有界刷新：短周期读取、读取不重叠、stop 后停止", async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active -= 1;
      return true;
    },
    onWindowEnd: () => {},
    intervalMs: 5,
    windowMs: 200,
  });

  await sleep(30);
  assert.ok(calls >= 2, `应至少读取两次，实际 ${calls}`);
  assert.equal(maxActive, 1, "读取不能重叠");
  refresh.stop();
  const stoppedAt = calls;
  await sleep(20);
  assert.equal(calls, stoppedAt, "stop 后不能再读取");
});

test("R4 到窗口上限停止自动读取并回调一次", async () => {
  let calls = 0;
  let windowEnd = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      return true;
    },
    onWindowEnd: () => { windowEnd += 1; },
    intervalMs: 5,
    windowMs: 20,
  });

  await sleep(45);
  assert.equal(windowEnd, 1, "窗口到期只回调一次");
  const stoppedAt = calls;
  await sleep(15);
  assert.equal(calls, stoppedAt, "窗口到期后停止读取");
  refresh.stop();
});

test("R4 读取失败只提示一次，并在窗口内继续读取", async () => {
  let calls = 0;
  let errors = 0;
  let windowEnd = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      return false;
    },
    onWindowEnd: () => { windowEnd += 1; },
    onReadError: () => { errors += 1; },
    intervalMs: 5,
    windowMs: 20,
  });

  await sleep(45);
  assert.ok(calls >= 2);
  assert.equal(errors, 1, "同一次检测的读取失败只提示一次");
  assert.equal(windowEnd, 1);
  refresh.stop();
});
