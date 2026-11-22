import test from "node:test";
import assert from "node:assert/strict";
import { buildSubmissionAssets, buildSubmissionState, buildVideoSubmitPayload, didSubmissionScreenshotsRefresh, sanitizeDraftSlot, serializeVideoSubmitDraft } from "./selectors";
import { createEditableFields, createEditableSlots, createInitialMeta } from "@/lib/video-submit/domain/video-submit-form-model";

test("buildSubmissionState keeps the canonical slot and metric references", () => {
  const slots = createEditableSlots();
  const fields = createEditableFields();
  const state = buildSubmissionState(slots, fields, false);
  assert.equal(state.slots, slots);
  assert.equal(state.fields, fields);
  assert.equal(state.submitted, false);
});

test("buildSubmissionAssets excludes local previews and keeps storage assets", () => {
  const slots = createEditableSlots();
  slots.screenshot_1 = {
    ...slots.screenshot_1,
    assetUrl: "/api/submission-screenshots/file?path=user-1/a/b.png",
    confirmed: true,
  };
  slots.screenshot_2 = {
    ...slots.screenshot_2,
    assetUrl: "blob:http://localhost/preview",
  };
  const assets = buildSubmissionAssets(slots);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].role, "screenshot_1");
});

test("保存时只把链接确实变化的截图判为刷新", () => {
  const original = [
    { role: "screenshot_1" as const, url: "/old/interaction.png" },
    { role: "screenshot_2" as const, url: "/old/retention.png" },
  ];
  assert.equal(didSubmissionScreenshotsRefresh(original, original), false);
  assert.equal(didSubmissionScreenshotsRefresh([
    { role: "screenshot_1", url: "/old/interaction.png" },
    { role: "screenshot_2", url: "/old/retention.png" },
  ], []), true);
  assert.equal(didSubmissionScreenshotsRefresh([
    { role: "screenshot_1", url: "/new/interaction.png" },
    { role: "screenshot_2", url: "/old/retention.png" },
  ], original), true);
});

test("serializeVideoSubmitDraft strips transient file and preview state", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.file = {} as File;
  slots.screenshot_1.previewUrl = "blob:temporary";
  const draft = serializeVideoSubmitDraft({
    meta: createInitialMeta("2026-10-01", "user-1"),
    fields: createEditableFields(),
    slots,
    keywordInput: "关键词",
    hasManualEdit: false,
    hasManualScriptAuthorSelection: false,
    hasManualOperatorSelection: false,
  });
  assert.equal(draft.slots.screenshot_1.file, null);
  assert.equal(draft.slots.screenshot_1.previewUrl, null);
  assert.equal(draft.keywordInput, "关键词");
  assert.equal("scriptText" in draft, false);
});

for (const status of ["uploading", "recognizing"] as const) {
  for (const hasAsset of [false, true]) {
    test(`草稿保存清理 ${status} ${hasAsset ? "有图" : "无图"}，不改变进行中的表单`, () => {
      const slots = createEditableSlots();
      slots.screenshot_1 = { ...slots.screenshot_1, status, itemId: "inflight",
        assetUrl: hasAsset ? "/api/submission-screenshots/file?path=user-1/a.png" : null,
        bucket: "submission-screenshots", path: "user-1/a.png",
        file: {} as File, previewUrl: "blob:temporary", startedAt: 123, error: "过期错误" };
      const draft = serializeVideoSubmitDraft({ meta: createInitialMeta("2026-11-22", "user-1"),
        fields: createEditableFields(), slots, keywordInput: "", hasManualEdit: false,
        hasManualScriptAuthorSelection: false, hasManualOperatorSelection: false });
      const saved = draft.slots.screenshot_1;
      assert.equal(saved.status, hasAsset ? "pending_confirm" : "empty");
      assert.equal(saved.file, null);
      assert.equal(saved.previewUrl, null);
      assert.equal(slots.screenshot_1.status, status);
      assert.deepEqual(sanitizeDraftSlot(saved), saved, "反复保存/恢复不再改变状态");
      if (hasAsset) {
        assert.equal(saved.ocrFallback, true);
        assert.equal(saved.confirmed, false);
        assert.equal(saved.requiresManualConfirmation, true);
        assert.equal(saved.bucket, "submission-screenshots");
        assert.equal(saved.path, "user-1/a.png");
        assert.equal(saved.error, "上次识别未完成，可点击重新识别或手动填写");
      } else {
        assert.equal(saved.itemId, undefined);
        assert.equal(saved.assetUrl, undefined);
        assert.equal(saved.path, undefined);
        assert.equal(saved.error, undefined);
      }
    });
  }
}

test("buildVideoSubmitPayload exposes one canonical request shape", () => {
  const payload = buildVideoSubmitPayload({
    mode: "create",
    videoId: null,
    accountId: "account-1",
    bizDate: "2026-10-01",
    videoUrl: "https://example.com/video",
    videoTitle: "标题",
    content: "文案",
    publishedAt: "2026-10-01T10:00",
    publishedAtText: "2026年10月1日 10:00",
    anomalyStatus: "normal",
    punishType: null,
    platformNotice: null,
    appeal: null,
    topicTag: "复盘",
    videoForm: "出镜",
    topicId: null,
    scriptAuthorUserId: null,
    videoEditorUserId: null,
    operatorUserId: null,
    manualEdit: false,
    screenshotsRefreshed: false,
    contentKeywords: [],
    assets: [],
    metrics: { play_count: 1 },
  });
  assert.equal(payload.account_id, "account-1");
  assert.equal(payload.metrics.play_count, 1);
  assert.equal(payload.mode, "create");
  // 导粉话术并入文案后不再单独收集：提交里不应再出现话术字段。
  assert.equal("script_text" in payload, false);
  assert.equal("script_format" in payload, false);
});
