import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createEditableFields, createEditableSlots, deriveSlotsFromItems, type ScreenshotItem } from "@/lib/video-submit/domain/video-submit-form-model";
import { canSubmit, createInitialSubmissionState, type SubmissionSlotRole } from "@/components/submission/提交状态机";
import { createOcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import { buildOcrMultipartFormData, buildOcrStorageRequestBody, createUploadHandler } from "./upload-controller";

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
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let previewId = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => fetcher(String(input), init)) as typeof fetch;
  URL.createObjectURL = (() => `blob:upload-test-${++previewId}`) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function screenshotUploadResponse(role: SubmissionSlotRole, suffix = "new.png") {
  const path = `user-1/account-1/${role}/${suffix}`;
  return jsonResponse({ data: { bucket: "submission-screenshots", path, url: `/api/submission-screenshots/file?path=${encodeURIComponent(path)}` } });
}

test("识别请求永远显式带类型：storage JSON 与 multipart FormData 均遵循槽位决定类型", () => {
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "a.png", role: "screenshot_1" }),
    { bucket: "submission-screenshots", path: "a.png", asset_role: "screenshot_1", screenshot_type: "data" },
  );
  assert.deepEqual(
    buildOcrStorageRequestBody({ bucket: "submission-screenshots", path: "b.png", role: "screenshot_2" }),
    { bucket: "submission-screenshots", path: "b.png", asset_role: "screenshot_2", screenshot_type: "retention" },
  );

  const file = new File(["img"], "a.png", { type: "image/png" });
  const dataForm = buildOcrMultipartFormData({ file, role: "screenshot_1" });
  assert.equal(dataForm.get("file"), file);
  assert.equal(dataForm.get("asset_role"), "screenshot_1");
  assert.equal(dataForm.get("screenshot_type"), "data");

  const retentionForm = buildOcrMultipartFormData({ file, role: "screenshot_2" });
  assert.equal(retentionForm.get("file"), file);
  assert.equal(retentionForm.get("asset_role"), "screenshot_2");
  assert.equal(retentionForm.get("screenshot_type"), "retention");
});

test("首次上传并行发出存档与 multipart 本地直传识别，且不等待存档完成才发识别", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "data.png", { type: "image/png" });
  const events: string[] = [];
  let releaseUpload: (() => void) | null = null;
  let ocrBody: FormData | null = null;
  const originalConsoleLog = console.log;
  const timingLogs: unknown[] = [];
  console.log = (...args: unknown[]) => {
    if (args[0] === "[OCR 耗时]") timingLogs.push(args[1]);
  };

  try {
    await withUploadMocks(async (url, init) => {
      if (url === "/api/submission-screenshots") {
        events.push("upload:start");
        await new Promise<void>((resolve) => { releaseUpload = resolve; });
        events.push("upload:resolve");
        return screenshotUploadResponse("screenshot_1");
      }
      if (url === "/api/ocr-screenshot") {
        events.push("ocr:start");
        assert.ok(init?.body instanceof FormData, "首次识别必须使用 FormData 直传本地文件");
        ocrBody = init.body;
        // 在确认识别已发出后再放行上传，实证两条支路真并行
        (releaseUpload as (() => void) | null)?.();
        return jsonResponse({
          data: {
            slot_status: "confirmed",
            screenshot_type: "retention",
            confidence_score: 0.95,
            requires_manual_confirmation: false,
            recognized_fields: { play_count: 100, likes: 10 },
          },
          timings: { download_ms: 0, ocr_ms: 120, parse_ms: 5, total_ms: 125 },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }, () => harness.handle("screenshot_1", file));
  } finally {
    console.log = originalConsoleLog;
  }

  assert.deepEqual(events.slice(0, 2), ["upload:start", "ocr:start"]);
  const capturedForm = ocrBody as FormData | null;
  assert.equal(capturedForm?.get("file"), file);
  assert.equal(capturedForm?.get("asset_role"), "screenshot_1");
  assert.equal(capturedForm?.get("screenshot_type"), "data");
  assert.equal(harness.slotsRef.current.screenshot_1.screenshotType, "data");
  assert.equal(harness.slotsRef.current.screenshot_1.status, "confirmed");
  assert.equal(harness.slotsRef.current.screenshot_2.status, "empty");
  assert.equal((timingLogs[0] as { mode?: string } | undefined)?.mode, "multipart");
});

test("存档成功 + 识别失败：保留截图、标 ocrFallback=true 且槽位转待确认", async () => {
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
  assert.ok(item.assetUrl);
  assert.equal(item.bucket, "submission-screenshots");
  assert.ok(item.path);
  assert.equal(item.ocrFallback, true);
  assert.match(item.error ?? "", /截图已保留，可直接手动填写指标/);
  assert.equal(item.batchStartedAt, 50_000);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "pending_confirm");
});

test("存档失败 + 识别成功：必须判 failed、assetUrl=null、ocrFallback=false 且不可提交", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "upload-fail.png", { type: "image/png" });
  await withUploadMocks(async (url) => {
    if (url === "/api/submission-screenshots") return jsonResponse({ error: "COS 写入超时" }, 500);
    if (url === "/api/ocr-screenshot") {
      return jsonResponse({
        data: {
          slot_status: "confirmed",
          screenshot_type: "data",
          confidence_score: 0.99,
          requires_manual_confirmation: false,
          recognized_fields: { play_count: 888, likes: 66 },
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, () => harness.handle("screenshot_1", file));

  const item = harness.itemsRef.current[0];
  assert.equal(item.status, "failed");
  assert.equal(item.assetUrl, null);
  assert.equal(item.bucket, null);
  assert.equal(item.path, null);
  assert.equal(item.confirmed, false);
  assert.equal(item.ocrFallback, false);
  assert.equal(harness.slotsRef.current.screenshot_1.status, "failed");
  assert.equal(harness.slotsRef.current.screenshot_1.confirmed, false);

  const fields = createEditableFields();
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    fields[key].value = "100";
  }
  const submissionState = createInitialSubmissionState({
    slots: {
      screenshot_1: harness.slotsRef.current.screenshot_1,
      screenshot_2: { ...harness.slotsRef.current.screenshot_2, status: "confirmed", confirmed: true },
    },
    fields,
  });
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: "normal",
    videoTitle: "标题",
    content: "文案",
    topicTag: "干货",
  });
  assert.equal(submitCheck.ok, false);
});

test("同槽换图同时取消旧图的上传与识别请求，另一槽不动", async () => {
  const harness = createUploadHarness();
  const first = new File(["a"], "first.png", { type: "image/png" });
  const second = new File(["b"], "second.png", { type: "image/png" });
  const retention = new File(["c"], "retention.png", { type: "image/png" });
  const ocrTypes: unknown[] = [];
  let releaseFirstUpload: (() => void) | null = null;
  let releaseFirstOcr: (() => void) | null = null;
  let firstUploadStarted = false;
  let firstUploadAborted = false;
  let firstOcrAborted = false;

  await withUploadMocks(async (url, init) => {
    if (url === "/api/submission-screenshots") {
      const form = init?.body as FormData;
      const role = form.get("asset_role") as SubmissionSlotRole;
      const uploadedFile = form.get("file");
      if (role === "screenshot_1" && uploadedFile === first) {
        firstUploadStarted = true;
        await new Promise<void>((resolve) => {
          releaseFirstUpload = resolve;
          init?.signal?.addEventListener("abort", () => { firstUploadAborted = true; resolve(); });
        });
      }
      return screenshotUploadResponse(role, `${role}.png`);
    }
    if (url === "/api/ocr-screenshot") {
      const form = init?.body as FormData;
      const screenshotType = form.get("screenshot_type");
      const uploadedFile = form.get("file");
      ocrTypes.push(screenshotType);
      if (uploadedFile === first) {
        await new Promise<void>((resolve) => {
          releaseFirstOcr = resolve;
          init?.signal?.addEventListener("abort", () => { firstOcrAborted = true; resolve(); });
        });
      }
      return jsonResponse({
        data: { slot_status: "confirmed", screenshot_type: screenshotType, confidence_score: 1, requires_manual_confirmation: false, recognized_fields: { play_count: 1 } },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, async () => {
    const pending = harness.handle("screenshot_1", first);
    await harness.handle("screenshot_2", retention);
    while (!firstUploadStarted || !ocrTypes.includes("data")) await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.handle("screenshot_1", second);
    (releaseFirstUpload as (() => void) | null)?.();
    (releaseFirstOcr as (() => void) | null)?.();
    await pending;
  });

  assert.equal(firstUploadAborted, true, "旧图的上传请求被取消");
  assert.equal(firstOcrAborted, true, "旧图的识别请求被取消");
  assert.equal(harness.itemsRef.current.length, 2, "互动槽只剩新图");
  assert.equal(harness.slotsRef.current.screenshot_1.file, second);
  assert.equal(harness.slotsRef.current.screenshot_2.file, retention);
  assert.ok(ocrTypes.includes("retention"));
  assert.ok(ocrTypes.filter((type) => type === "data").length >= 2);
});

test("retryItem：已有 assetUrl/bucket/path 时不重复上传，有 file 走 multipart、无 file 走 storage JSON", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "retry.png", { type: "image/png" });
  let uploadCount = 0;
  let ocrCount = 0;
  let lastOcrMode: "multipart" | "storage" | null = null;
  let lastJsonBody: Record<string, unknown> | null = null;

  await withUploadMocks(async (url, init) => {
    if (url === "/api/submission-screenshots") {
      uploadCount += 1;
      return screenshotUploadResponse("screenshot_1", "retry.png");
    }
    if (url === "/api/ocr-screenshot") {
      ocrCount += 1;
      if (init?.body instanceof FormData) {
        lastOcrMode = "multipart";
      } else {
        lastOcrMode = "storage";
        lastJsonBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      }
      if (ocrCount === 1) return jsonResponse({ error_code: "AI_TIMEOUT" }, 500);
      return jsonResponse({
        data: {
          slot_status: "confirmed",
          screenshot_type: "data",
          confidence_score: 0.96,
          requires_manual_confirmation: false,
          recognized_fields: { play_count: 321 },
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, async () => {
    // 1) 首次：上传成功 + 识别失败
    await harness.handle("screenshot_1", file);
    assert.equal(uploadCount, 1);
    assert.equal(ocrCount, 1);

    const itemId = harness.itemsRef.current[0].id;
    // 2) 内存中仍有 file 时点击重新识别：不再调 /api/submission-screenshots，直接 multipart 识别
    await harness.handle.retryItem(itemId);
    assert.equal(uploadCount, 1, "有 assetUrl/bucket/path 时不得重复上传");
    assert.equal(ocrCount, 2);
    assert.equal(lastOcrMode, "multipart");
    assert.equal(harness.itemsRef.current[0].status, "done");

    // 3) 模拟刷新草稿后 item.file 丢失但保留 assetUrl/bucket/path：回退 storage JSON 识别，仍不重复上传
    harness.itemsRef.current = [{ ...harness.itemsRef.current[0], file: null }];
    await harness.handle.retryItem(itemId);
    assert.equal(uploadCount, 1, "刷新后重新识别仍不得重复上传");
    assert.equal(ocrCount, 3);
    assert.equal(lastOcrMode, "storage");
    assert.deepEqual(lastJsonBody, {
      bucket: "submission-screenshots",
      path: "user-1/account-1/screenshot_1/retry.png",
      asset_role: "screenshot_1",
      screenshot_type: "data",
    });
  });
});

test("存档失败 + 识别失败：判 failed、assetUrl=null、ocrFallback=false，且 retryItem 可重走并行上传与识别", async () => {
  const harness = createUploadHarness();
  const file = new File(["image"], "both-fail.png", { type: "image/png" });
  let attempt = 0;

  await withUploadMocks(async (url) => {
    if (url === "/api/submission-screenshots") {
      attempt += 1;
      if (attempt === 1) return jsonResponse({ error: "COS 写入超时" }, 500);
      return screenshotUploadResponse("screenshot_1", "recovered.png");
    }
    if (url === "/api/ocr-screenshot") {
      if (attempt === 1) return jsonResponse({ error_code: "AI_TIMEOUT" }, 500);
      return jsonResponse({
        data: {
          slot_status: "confirmed",
          screenshot_type: "data",
          confidence_score: 0.95,
          requires_manual_confirmation: false,
          recognized_fields: { play_count: 500 },
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }, async () => {
    await harness.handle("screenshot_1", file);
    const failedItem = harness.itemsRef.current[0];
    assert.equal(failedItem.status, "failed");
    assert.equal(failedItem.assetUrl, null);
    assert.equal(failedItem.ocrFallback, false);
    assert.equal(harness.slotsRef.current.screenshot_1.status, "failed");

    await harness.handle.retryItem(failedItem.id);
    const recoveredItem = harness.itemsRef.current[0];
    assert.equal(recoveredItem.status, "done");
    assert.ok(recoveredItem.assetUrl);
    assert.equal(harness.slotsRef.current.screenshot_1.status, "confirmed");
  });
});
