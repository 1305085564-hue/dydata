import test from "node:test";
import assert from "node:assert/strict";
import { buildSubmissionAssets, buildSubmissionState, serializeVideoSubmitDraft } from "./selectors";
import { createEditableFields, createEditableSlots, createInitialMeta } from "@/app/(app)/dashboard/video-submit-form-model";

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

test("serializeVideoSubmitDraft strips transient file and preview state", () => {
  const slots = createEditableSlots();
  slots.screenshot_1.file = {} as File;
  slots.screenshot_1.previewUrl = "blob:temporary";
  const draft = serializeVideoSubmitDraft({
    meta: createInitialMeta("2026-10-01", "user-1"),
    fields: createEditableFields(),
    slots,
    scriptText: "话术",
    keywordInput: "关键词",
  });
  assert.equal(draft.slots.screenshot_1.file, null);
  assert.equal(draft.slots.screenshot_1.previewUrl, null);
  assert.equal(draft.scriptText, "话术");
});
