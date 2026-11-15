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

test("默认 OCR 请求不携带槽位类型，显式重试才携带类型", () => {
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "a.png", role: "screenshot_1" }),
    { bucket: "submission-screenshots", path: "a.png", asset_role: "screenshot_1" },
  );
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "b.png", role: "screenshot_2", screenshotType: "retention" }),
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

test("自动识别为完播时按内容派生到完播槽，图片不在槽位间搬运", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "retention.png", { type: "image/png" });
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
          recognized_fields: { retention_metrics: { avg_play_duration: 20, completion_rate: 50 } },
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file));

  assert.equal((ocrBody as Record<string, unknown> | null)?.screenshot_type, undefined);
  assert.equal(harness.slotsRef.current.screenshot_2.screenshotType, "retention");
  assert.equal(harness.slotsRef.current.screenshot_2.file, file);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "empty");
});
