import test from "node:test";
import assert from "node:assert/strict";

import { measureAsync } from "./perf";

test("性能计时返回任务原值，0 也不会被改写", async () => {
  assert.equal(await measureAsync("zero", async () => 0), 0);
});

test("任务异常原样抛出", async () => {
  await assert.rejects(() => measureAsync("fail", async () => { throw new Error("boom"); }), /boom/);
});

test("开启性能日志后即使任务失败也记录耗时", async (t) => {
  const previous = process.env.DYDATA_PERF_LOG;
  process.env.DYDATA_PERF_LOG = "1";
  const info = t.mock.method(console, "info", () => {});
  t.after(() => { process.env.DYDATA_PERF_LOG = previous; });
  await measureAsync("task", async () => null);
  assert.match(String(info.mock.calls[0]?.arguments[0]), /^\[perf\] task \d+ms$/);
});
