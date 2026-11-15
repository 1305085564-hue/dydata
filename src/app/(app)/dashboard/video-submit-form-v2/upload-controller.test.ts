import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createEditableSlots, deriveSlotsFromItems, type ScreenshotItem } from "../video-submit-form-model";
import { createOcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import { buildOcrStorageRequestBody, createUploadHandler } from "./upload-controller";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";

function createUploadHarness() {
  const slotsRef = { current: createEditableSlots() };
  const itemsRef = { current: [] as ScreenshotItem[] };
  const ocrTasksRef = { current: createOcrTaskRegistry() };
  const blobUrlsRef = { current: new Set<string>() };
  const updateItemsState = (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => {
    itemsRef.current = updater(itemsRef.current);
    slotsRef.current = deriveSlotsFromItems(itemsRef.current);
  };
  const handle = createUploadHandler({
    account: { id: "account-1" },
    userId: "user-1",
    initialSummary: null,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    } as unknown as SupabaseClient,
    ocrTasksRef,
    slotsRef,
    itemsRef,
    blobUrlsRef,
    updateItemsState,
    dispatchWorkflow() {},
  });
  return { handle, slotsRef, itemsRef, blobUrlsRef };
}

async function withUploadMocks<T>(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  let previewId = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => fetcher(String(input), init)) as typeof fetch;
  URL.createObjectURL = (() => `blob:upload-test-${++previewId}`) as typeof URL.createObjectURL;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function screenshotUploadResponse(role: SubmissionSlotRole) {
  const path = `user-1/account-1/${role}/new.png`;
  return jsonResponse({ data: { bucket: "submission-screenshots", path, url: `/api/submission-screenshots/file?path=${encodeURIComponent(path)}` } });
}

test("识别请求永远显式带类型：互动槽 data、留存槽 retention", () => {
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "a.png", role: "screenshot_1" }),
    { bucket: "submission-screenshots", path: "a.png", asset_role: "screenshot_1", screenshot_type: "data" },
  );
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "b.png", role: "screenshot_2" }),
    { bucket: "submission-screenshots", path: "b.png", asset_role: "screenshot_2", screenshot_type: "retention" },
  );
});

test("识别失败时清单保留图片并转待确认", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "replacement.png", { type: "image/png" });
  await withUploadMocks(async (url) => {
    if (url === "/api/submission-screenshots") return screenshotUploadResponse("screenshot_1");
    if (url === "/api/ocr-screenshot") return jsonResponse({ error_code: "AI_CHANNEL_UNAVAILABLE" }, 500);
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file, 50_000));

  const item = harness.itemsRef.current[0];
  assert.equal(item.status, "failed");
  assert.equal(item.file, file);
  assert.equal(item.ocrFallback, true);
  assert.match(item.error ?? "", /截图已保留，可直接手动填写指标/);
  assert.equal(item.batchStartedAt, 50_000);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "pending_confirm");
});

test("类型跟着槽位走：互动槽的图即使识别结果报成完播也留在互动槽", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "data.png", { type: "image/png" });
  let ocrBody: Record<string, unknown> | null = null;
  await withUploadMocks(async (url, init) => {
    if (url === "/api/submission-screenshots") return screenshotUploadResponse("screenshot_1");
    if (url === "/api/ocr-screenshot") {
      ocrBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        data: {
          slot_status: "confirmed",
          screenshot_type: "retention",
          confidence_score: 0.95,
          requires_manual_confirmation: false,
          recognized_fields: { play_count: 100, likes: 10 },
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file));

  assert.equal((ocrBody as Record<string, unknown> | null)?.screenshot_type, "data");
  assert.equal(harness.slotsRef.current.screenshot_1.screenshotType, "data");
  assert.equal(harness.slotsRef.current.screenshot_1.file, file);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "confirmed");
  assert.equal(harness.slotsRef.current.screenshot_2.status, "empty");
});

test("点哪张换哪张：同槽新图立即替换旧图，旧图的识别被取消，另一槽不动", async () => {
  const harness = createUploadHarness();
  const first = new File(["a"], "first.png", { type: "image/png" });
  const second = new File(["b"], "second.png", { type: "image/png" });
  const retention = new File(["c"], "retention.png", { type: "image/png" });
  const ocrTypes: unknown[] = [];
  let releaseFirst: (() => void) | null = null;
  let firstAborted = false;
  await withUploadMocks(async (url, init) => {
    if (url === "/api/submission-screenshots") return screenshotUploadResponse("screenshot_1");
    if (url === "/api/ocr-screenshot") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      ocrTypes.push(body.screenshot_type);
      if (body.screenshot_type === "data" && ocrTypes.filter((type) => type === "data").length === 1) {
        // 第一张一直识别不完，模拟用户在识别途中换图
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
          init?.signal?.addEventListener("abort", () => { firstAborted = true; resolve(); });
        });
      }
      return jsonResponse({
        data: { slot_status: "confirmed", screenshot_type: body.screenshot_type, confidence_score: 1, requires_manual_confirmation: false, recognized_fields: { play_count: 1 } },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, async () => {
    const pending = harness.handle("screenshot_1", first);
    await harness.handle("screenshot_2", retention);
    while (!ocrTypes.includes("data")) await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.handle("screenshot_1", second);
    (releaseFirst as (() => void) | null)?.();
    await pending;
  });

  assert.equal(firstAborted, true, "旧图的识别请求被取消");
  assert.equal(harness.itemsRef.current.length, 2, "互动槽只剩新图");
  assert.equal(harness.slotsRef.current.screenshot_1.file, second);
  assert.equal(harness.slotsRef.current.screenshot_2.file, retention);
  assert.ok(ocrTypes.includes("retention"));
  assert.ok(ocrTypes.filter((type) => type === "data").length >= 2);
});
