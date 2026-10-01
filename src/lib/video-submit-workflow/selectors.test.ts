import test from "node:test";
import assert from "node:assert/strict";
import { buildSubmissionAssets, buildSubmissionState } from "./selectors";
import { createEditableFields, createEditableSlots } from "@/app/(app)/dashboard/video-submit-form-model";

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
