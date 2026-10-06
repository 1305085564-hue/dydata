import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowState, workflowReducer } from "./reducer";
import type { FormMetaState } from "@/app/(app)/dashboard/video-submit-form-model";
import { createEditableFields, createEditableSlots, createInitialMeta } from "@/app/(app)/dashboard/video-submit-form-model";

function makeState() {
  return createWorkflowState({
    meta: createInitialMeta("2026-10-01", "user-1"),
    fields: createEditableFields(),
    slots: createEditableSlots(),
  });
}

test("workflow reducer updates one meta field without dropping the rest", () => {
  const state = makeState();
  const next = workflowReducer(state, {
    type: "meta/update",
    updater: (current) => ({ ...current, videoTitle: "新标题" }),
  });

  assert.equal(next.meta.videoTitle, "新标题");
  assert.equal(next.meta.bizDate, state.meta.bizDate);
  assert.notEqual(next, state);
  assert.equal(next.fields, state.fields);
});

test("workflow reducer replaces a draft as one state transition", () => {
  const state = makeState();
  const draftMeta: FormMetaState = { ...state.meta, videoTitle: "草稿标题" };
  const next = workflowReducer(state, {
    type: "draft/restore",
    meta: draftMeta,
    fields: {
      ...state.fields,
      play_count: { ...state.fields.play_count, value: "123" },
    },
    slots: {
      ...state.slots,
      screenshot_1: { ...state.slots.screenshot_1, status: "confirmed", confirmed: true },
    },
  });

  assert.equal(next.meta.videoTitle, "草稿标题");
  assert.equal(next.fields.play_count.value, "123");
  assert.equal(next.slots.screenshot_1.status, "confirmed");
});

test("workflow reducer ignores stale functional updates after a replacement", () => {
  const state = makeState();
  const replaced = workflowReducer(state, {
    type: "draft/restore",
    meta: { ...state.meta, videoTitle: "草稿标题" },
    fields: state.fields,
    slots: state.slots,
  });
  const next = workflowReducer(replaced, {
    type: "meta/update",
    updater: (current) => ({ ...current, content: "草稿文案" }),
  });

  assert.equal(next.meta.videoTitle, "草稿标题");
  assert.equal(next.meta.content, "草稿文案");
});

test("workflow reducer commits OCR metadata and metrics as one event", () => {
  const state = makeState();
  const next = workflowReducer(state, {
    type: "ocr/commit",
    meta: (current) => ({ ...current, videoTitle: "识别标题" }),
    fields: (current) => ({
      ...current,
      play_count: { ...current.play_count, value: "321" },
    }),
    slots: (current) => ({
      ...current,
      screenshot_1: { ...current.screenshot_1, status: "confirmed", confirmed: true },
    }),
  });

  assert.equal(next.meta.videoTitle, "识别标题");
  assert.equal(next.fields.play_count.value, "321");
  assert.equal(next.slots.screenshot_1.confirmed, true);
});

test("workflow reducer commits OCR publishedAt and publishedAtText faithfully", () => {
  const state = makeState();
  const next = workflowReducer(state, {
    type: "ocr/commit",
    meta: (current) => ({
      ...current,
      publishedAt: "2026-09-30T19:00:00+08:00",
      publishedAtText: "昨天 19:00",
    }),
  });

  assert.equal(next.meta.publishedAt, "2026-09-30T19:00:00+08:00");
  assert.equal(next.meta.publishedAtText, "昨天 19:00");
});

test("workflow reducer keeps script fields and manual provenance in the canonical state", () => {
  const state = createWorkflowState({
    meta: createInitialMeta("2026-10-01", "user-1"),
    fields: createEditableFields(),
    slots: createEditableSlots(),
    draft: {
      scriptText: "初始话术",
      keywordInput: "初始关键词",
      hasManualEdit: false,
      hasManualScriptAuthorSelection: false,
      hasManualOperatorSelection: false,
    },
  });

  const next = workflowReducer(state, {
    type: "draft/update",
    updater: (current) => ({
      ...current,
      scriptText: "修改后的话术",
      hasManualEdit: true,
    }),
  });

  assert.equal(next.scriptText, "修改后的话术");
  assert.equal(next.keywordInput, "初始关键词");
  assert.equal(next.hasManualEdit, true);
  assert.equal(state.scriptText, "初始话术");
});

test("workflow draft restore restores script fields and manual provenance with form data", () => {
  const state = makeState();
  const next = workflowReducer(state, {
    type: "draft/restore",
    meta: state.meta,
    fields: state.fields,
    slots: state.slots,
    draft: {
      scriptText: "草稿话术",
      keywordInput: "草稿关键词",
      hasManualEdit: true,
      hasManualScriptAuthorSelection: true,
      hasManualOperatorSelection: true,
    },
  });

  assert.equal(next.scriptText, "草稿话术");
  assert.equal(next.keywordInput, "草稿关键词");
  assert.equal(next.hasManualEdit, true);
  assert.equal(next.hasManualScriptAuthorSelection, true);
  assert.equal(next.hasManualOperatorSelection, true);
});
