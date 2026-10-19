import test from "node:test";
import assert from "node:assert/strict";

import {
  SCREENSHOT_MAX_AUTO_RETRY,
  SCREENSHOT_RETRY_DELAY_MS,
  initialScreenshotImageState,
  onScreenshotError,
  onScreenshotLoaded,
  onScreenshotManualRetry,
} from "./screenshot-image-state";

test("初始态是 loading，未消耗重试次数", () => {
  assert.equal(initialScreenshotImageState.status, "loading");
  assert.equal(initialScreenshotImageState.attempts, 0);
});

test("第一次失败只进入 retrying，不降级为占位图", () => {
  const decision = onScreenshotError(initialScreenshotImageState);
  assert.equal(decision.retry, true);
  assert.equal(decision.state.status, "retrying");
  assert.equal(decision.state.attempts, 1);
});

test("第二次失败才降级为 failed（避免网络抖动被误报成截图缺失）", () => {
  const first = onScreenshotError(initialScreenshotImageState);
  const second = onScreenshotError(first.state);
  assert.equal(second.retry, false);
  assert.equal(second.state.status, "failed");
  assert.equal(second.state.attempts, 1);
});

test("失败态继续收到 error 不会再触发重试", () => {
  const failed = onScreenshotError(onScreenshotError(initialScreenshotImageState).state);
  const again = onScreenshotError(failed.state);
  assert.equal(again.retry, false);
  assert.equal(again.state.status, "failed");
});

test("加载成功后回到初始态，计数清零", () => {
  const retrying = onScreenshotError(initialScreenshotImageState).state;
  const loaded = onScreenshotLoaded();
  assert.deepEqual(loaded, initialScreenshotImageState);
  assert.notEqual(retrying.status, loaded.status);
});

test("用户手动重试后可以重新走一轮自动重试", () => {
  const manual = onScreenshotManualRetry();
  assert.deepEqual(manual, initialScreenshotImageState);
  const next = onScreenshotError(manual);
  assert.equal(next.retry, true);
  assert.equal(next.state.status, "retrying");
});

test("自动重试次数与延迟是契约值：改成多次或长时间等待都会让占位图闪现/卡顿", () => {
  assert.equal(SCREENSHOT_MAX_AUTO_RETRY, 1);
  assert.equal(SCREENSHOT_RETRY_DELAY_MS, 400);
});
