import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEditableFields, createEditableSlots, createInitialMeta, deriveSlotsFromItems, type ScreenshotItem } from "@/lib/video-submit/domain/video-submit-form-model";
import { createWorkflowState, workflowReducer } from "@/lib/video-submit-workflow/reducer";
import { serializeVideoSubmitDraft } from "@/lib/video-submit-workflow/selectors";
import { createOcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { WorkflowAction, VideoSubmitDraftData } from "@/lib/video-submit-workflow/types";
import { applyRestoredVideoSubmitDraft } from "./draft-controller";
import { createUploadHandler } from "./upload-controller";

function createRestoreHarness() {
  let workflow = createWorkflowState({
    meta: createInitialMeta("2026-11-22", "user-1"),
    fields: createEditableFields(),
    slots: createEditableSlots(),
  });
  const screenshotItemsRef = { current: [] as ScreenshotItem[] };
  const slotsRef = { current: workflow.slots };
  let renderedItems: ScreenshotItem[] = [];
  const dispatchWorkflow = (action: WorkflowAction) => { workflow = workflowReducer(workflow, action); };
  const restoreOptions = {
    userId: "user-1", screenshotItemsRef, slotsRef, dispatchWorkflow,
    setScreenshotItems: (items: ScreenshotItem[]) => { renderedItems = items; },
  };
  const upload = createUploadHandler({
    account: { id: "account-1" }, userId: "user-1", initialSummary: null,
    supabase: { auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) } } as unknown as SupabaseClient,
    ocrTasksRef: { current: createOcrTaskRegistry() }, slotsRef, itemsRef: screenshotItemsRef,
    blobUrlsRef: { current: new Set<string>() }, dispatchWorkflow,
    updateItemsState(updater) {
      const items = updater(screenshotItemsRef.current);
      screenshotItemsRef.current = items;
      renderedItems = items;
      slotsRef.current = deriveSlotsFromItems(items);
      dispatchWorkflow({ type: "slots/update", updater: () => slotsRef.current });
    },
  });
  return { restoreOptions, upload, slotsRef, screenshotItemsRef,
    get workflow() { return workflow; }, get renderedItems() { return renderedItems; } };
}

for (const legacy of [false, true]) {
  test(`${legacy ? "旧草稿仅有链接" : "新草稿保留存储路径"}：真实序列化后恢复并重新识别，发出 storage 请求并回填`, async () => {
    const beforeRefresh = createRestoreHarness();
    const path = "user-1/account-1/screenshot_1/draft.png";
    const assetUrl = `/api/submission-screenshots/file?path=${encodeURIComponent(path)}`;
    const slots = createEditableSlots();
    slots.screenshot_1 = { ...slots.screenshot_1, status: "pending_confirm",
      assetUrl, itemId: "uploaded-draft-item", bucket: "submission-screenshots", path,
      requiresManualConfirmation: true, confirmed: false, ocrFallback: true,
      fileName: "原截图.png", recognizedFields: { play_count: 7 }, ocrSummary: ["播放量：7"],
    };
    const saved = serializeVideoSubmitDraft({ ...beforeRefresh.workflow, slots });
    if (legacy) {
      delete saved.slots.screenshot_1.bucket;
      delete saved.slots.screenshot_1.path;
      delete saved.slots.screenshot_1.itemId;
    }
    const storageEntry = JSON.stringify({ data: saved, savedAt: "2026-11-22T02:00:00Z" });
    const restored = createRestoreHarness();
    applyRestoredVideoSubmitDraft((JSON.parse(storageEntry) as { data: VideoSubmitDraftData }).data, restored.restoreOptions);
    const slot = restored.slotsRef.current.screenshot_1;
    assert.equal(slot.itemId, legacy ? "restored-screenshot_1" : "uploaded-draft-item");
    assert.equal(restored.workflow.slots.screenshot_1.itemId, slot.itemId);
    assert.equal(restored.renderedItems, restored.screenshotItemsRef.current);
    assert.equal(restored.renderedItems[0].id, slot.itemId);
    assert.equal(restored.renderedItems[0].file, null);
    assert.equal(restored.renderedItems[0].previewUrl, assetUrl);
    assert.equal(restored.renderedItems[0].path, path);
    assert.deepEqual(restored.renderedItems[0].ocrSummary, ["播放量：7"]);
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ data: { slot_status: "confirmed", screenshot_type: "data", confidence_score: 0.98,
        requires_manual_confirmation: false, recognized_fields: { play_count: 1234, likes: 56 } } });
    }) as typeof fetch;
    try { await restored.upload.retryItem(slot.itemId!); } finally { globalThis.fetch = fetchBefore; }
    assert.deepEqual(requests, [{ url: "/api/ocr-screenshot", body: {
      bucket: "submission-screenshots", path, asset_role: "screenshot_1", screenshot_type: "data",
    } }]);
    assert.equal(restored.workflow.fields.play_count.value, "1234");
    assert.equal(restored.workflow.fields.likes.value, "56");
    assert.equal(restored.workflow.slots.screenshot_1.status, "confirmed");
    assert.equal(restored.renderedItems[0].status, "done");
  });
}

for (const status of ["uploading", "recognizing"] as const) {
  for (const hasAsset of [false, true]) {
    test(`直接读入旧草稿：${status} ${hasAsset ? "有图转待确认" : "无图可重新上传"}`, () => {
      const harness = createRestoreHarness();
      const slots = createEditableSlots();
      slots.screenshot_1 = { ...slots.screenshot_1, status, itemId: "interrupted", file: {} as File,
        previewUrl: "blob:expired", assetUrl: hasAsset ? "/api/submission-screenshots/file?path=user-1/a.png" : null,
        error: "旧错误", startedAt: 100, phaseStartedAt: 101 };
      applyRestoredVideoSubmitDraft({ ...harness.workflow, slots }, harness.restoreOptions);
      const slot = harness.workflow.slots.screenshot_1;
      assert.equal(slot.status, hasAsset ? "pending_confirm" : "empty");
      assert.equal(slot.file, hasAsset ? null : undefined);
      if (hasAsset) {
        assert.equal(slot.ocrFallback, true);
        assert.equal(slot.requiresManualConfirmation, true);
        assert.equal(slot.confirmed, false);
        assert.match(slot.error ?? "", /上次识别未完成/);
        assert.equal(harness.renderedItems[0].id, slot.itemId);
      } else {
        assert.equal(slot.itemId, undefined);
        assert.equal(slot.error, undefined);
        assert.deepEqual(harness.renderedItems, []);
      }
    });
  }
}
