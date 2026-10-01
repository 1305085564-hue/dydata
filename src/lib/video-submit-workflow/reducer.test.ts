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
