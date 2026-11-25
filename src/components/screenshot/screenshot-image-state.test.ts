import test from "node:test";
import assert from "node:assert/strict";

import {
  SCREENSHOT_MAX_AUTO_RETRY,
  SCREENSHOT_PROBE_TIMEOUT_MS,
  SCREENSHOT_RETRY_DELAY_MS,
  classifyScreenshotStatus,
  initialScreenshotImageState,
  onScreenshotError,
  onScreenshotFailureProbed,
  onScreenshotLoaded,
  onScreenshotManualRetry,
  probeScreenshotFailureReason,
  resolveScreenshotRenderPhase,
  shouldRenderScreenshotPlaceholder,
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

test("第二次失败先进入探测态，不闪出默认重试占位", () => {
  const first = onScreenshotError(initialScreenshotImageState);
  const second = onScreenshotError(first.state);
  assert.equal(second.retry, false);
  assert.equal(second.state.status, "probing");
  assert.equal(second.state.attempts, 1);
  assert.equal(shouldRenderScreenshotPlaceholder(second.state.status), false);
  assert.deepEqual(onScreenshotFailureProbed("missing"), { status: "failed", reason: "missing" });
  assert.equal(shouldRenderScreenshotPlaceholder("failed"), true);
});

test("首次加载渲染原图；进入重试等待、二次请求、探测态全程走骨架，最终才进占位", () => {
  assert.equal(resolveScreenshotRenderPhase("loading", 0), "image");
  assert.equal(resolveScreenshotRenderPhase("retrying", 1), "skeleton");
  assert.equal(resolveScreenshotRenderPhase("loading", 1), "skeleton");
  assert.equal(resolveScreenshotRenderPhase("probing", 1), "skeleton");
  assert.equal(resolveScreenshotRenderPhase("failed", 1), "placeholder");
});

test("失败态继续收到 error 不会再触发重试", () => {
  const failed = onScreenshotError(onScreenshotError(initialScreenshotImageState).state);
  const again = onScreenshotError(failed.state);
  assert.equal(again.retry, false);
  assert.equal(again.state.status, "probing");
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

test("自动重试次数、延迟与探测超时上限是契约值", () => {
  assert.equal(SCREENSHOT_MAX_AUTO_RETRY, 1);
  assert.equal(SCREENSHOT_RETRY_DELAY_MS, 400);
  assert.equal(SCREENSHOT_PROBE_TIMEOUT_MS, 3_000);
});

test("只有明确的 404 才算原图已丢失，其他状态码都算暂时读不到", () => {
  assert.equal(classifyScreenshotStatus(404), "missing");
  for (const status of [200, 401, 403, 502, 503, 500]) {
    assert.equal(classifyScreenshotStatus(status), "unavailable", String(status));
  }
});

test("探测网络异常或请求本身失败时，不冒充文件缺失", async () => {
  const thrown = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=a", async () => {
    throw new Error("network down");
  });
  assert.equal(thrown, "unavailable");
});

test("探测请求挂住超过上限时主动中止并返回暂时读不到，避免骨架永久转圈", async () => {
  let aborted = false;
  const reason = await probeScreenshotFailureReason(
    "/api/submission-screenshots/file?path=hanging",
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
    25,
  );
  assert.equal(aborted, true);
  assert.equal(reason, "unavailable");
});

test("探测到 404 时返回原图已丢失，并放掉响应体不占连接", async () => {
  let canceled = false;
  const fakeResponse = {
    status: 404,
    body: { cancel: async () => { canceled = true; } },
  } as unknown as Response;
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=a", async () => fakeResponse);
  assert.equal(reason, "missing");
  assert.equal(canceled, true);
});

test("探测到服务异常时返回暂时读不到（保留重试入口）", async () => {
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=a", async () => new Response(null, { status: 502 }));
  assert.equal(reason, "unavailable");
});

test("探测到 5xx 时最终进入可重试占位态", async () => {
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=a", async () => new Response(null, { status: 500 }));
  assert.deepEqual(onScreenshotFailureProbed(reason), { status: "failed", reason: "unavailable" });
});
