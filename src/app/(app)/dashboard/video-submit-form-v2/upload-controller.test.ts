import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createEditableSlots, type SlotViewState } from "../video-submit-form-model";
import { createOcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import { buildOcrStorageRequestBody, createUploadHandler } from "./upload-controller";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";

function createUploadHarness() {
  const slotsRef = { current: createEditableSlots() };
  const ocrTasksRef = { current: createOcrTaskRegistry() };
  const blobUrlsRef = { current: new Set<string>() };
  const handle = createUploadHandler({
    account: { id: "account-1" },
    userId: "user-1",
    initialSummary: null,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
      },
    } as unknown as SupabaseClient,
    ocrTasksRef,
    slotsRef,
    blobUrlsRef,
    updateSlotsState(updater) {
      slotsRef.current = updater(slotsRef.current);
    },
    dispatchWorkflow() {},
  });

  return { handle, slotsRef, blobUrlsRef };
}

async function withUploadMocks<T>(
  fetcher: (url: string) => Promise<Response>,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  let previewId = 0;
  globalThis.fetch = ((input: RequestInfo | URL) => fetcher(String(input))) as typeof fetch;
  URL.createObjectURL = (() => `blob:upload-test-${++previewId}`) as typeof URL.createObjectURL;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function screenshotUploadResponse(role: SubmissionSlotRole) {
  const path = `user-1/account-1/${role}/new.png`;
  return jsonResponse({
    data: {
      bucket: "submission-screenshots",
      path,
      url: `/api/submission-screenshots/file?path=${encodeURIComponent(path)}`,
    },
  });
}

test("OCR 上传请求显式携带槽位对应的截图类型", () => {
  assert.deepEqual(
    buildOcrStorageRequestBody({
      bucket: "submission-screenshots",
      path: "user/account/screenshot_1/a.png",
      role: "screenshot_1",
    }),
    {
      bucket: "submission-screenshots",
      path: "user/account/screenshot_1/a.png",
      asset_role: "screenshot_1",
      screenshot_type: "data",
    },
  );

  assert.deepEqual(
    buildOcrStorageRequestBody({
      bucket: "submission-screenshots",
      path: "user/account/screenshot_2/a.png",
      role: "screenshot_2",
    }),
    {
      bucket: "submission-screenshots",
      path: "user/account/screenshot_2/a.png",
      asset_role: "screenshot_2",
      screenshot_type: "retention",
    },
  );
});

test("OCR 请求整段失败时保留已上传截图、预览、手填入口状态和耗时", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "replacement.png", { type: "image/png" });
  harness.slotsRef.current.screenshot_1 = {
    ...harness.slotsRef.current.screenshot_1,
    status: "confirmed",
    assetUrl: "/api/old-screenshot",
    previewUrl: "/api/old-preview",
    startedAt: 100,
    phaseStartedAt: 200,
    finishedAt: 300,
  };

  await withUploadMocks(async (url) => {
    if (url === "/api/submission-screenshots") return screenshotUploadResponse("screenshot_1");
    if (url === "/api/ocr-screenshot") {
      return jsonResponse({ error_code: "AI_CHANNEL_UNAVAILABLE" }, 500);
    }
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file, 50_000));

  const slot = harness.slotsRef.current.screenshot_1;
  assert.equal(slot.status, "pending_confirm");
  assert.match(slot.assetUrl ?? "", /new\.png/);
  assert.match(slot.previewUrl ?? "", /^blob:upload-test-/);
  assert.equal(slot.file, file);
  assert.equal(slot.confirmed, false);
  assert.equal(slot.requiresManualConfirmation, true);
  assert.equal(slot.ocrFallback, true);
  assert.match(slot.error ?? "", /截图已保留，可直接手动填写指标/);
  assert.equal(slot.batchStartedAt, 50_000);
  assert.ok((slot.startedAt ?? 0) > 100);
  assert.ok((slot.phaseStartedAt ?? 0) >= (slot.startedAt ?? 0));
  assert.ok((slot.finishedAt ?? 0) >= (slot.phaseStartedAt ?? 0));
});

test("智能对调时每张图的耗时字段跟随图片移动", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "retention.png", { type: "image/png" });

  await withUploadMocks(async (url) => {
    if (url === "/api/submission-screenshots") return screenshotUploadResponse("screenshot_1");
    if (url === "/api/ocr-screenshot") {
      return jsonResponse({
        data: {
          slot_status: "confirmed",
          screenshot_type: "retention",
          confidence_score: 0.95,
          requires_manual_confirmation: false,
          recognized_fields: {
            recognized: true,
            retention_metrics: {
              avg_play_duration: 20,
              bounce_rate_2s: 30,
              completion_rate_5s: 40,
              completion_rate: 50,
            },
          },
        },
        screenshot_type_source: "explicit",
        timings: { total_ms: 1 },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file));

  const movedSlot = harness.slotsRef.current.screenshot_2 as SlotViewState;
  assert.equal(movedSlot.status, "confirmed");
  assert.equal(movedSlot.file, file);
  assert.match(movedSlot.assetUrl ?? "", /new\.png/);
  assert.ok(typeof movedSlot.startedAt === "number");
  assert.ok(typeof movedSlot.phaseStartedAt === "number");
  assert.ok(typeof movedSlot.finishedAt === "number");
  assert.equal(movedSlot.batchStartedAt, movedSlot.startedAt);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "empty");
  assert.equal(harness.slotsRef.current.screenshot_1.startedAt, undefined);
  assert.equal(harness.slotsRef.current.screenshot_1.phaseStartedAt, undefined);
  assert.equal(harness.slotsRef.current.screenshot_1.finishedAt, undefined);
});
