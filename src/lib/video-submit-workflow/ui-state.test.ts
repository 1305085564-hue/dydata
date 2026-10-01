import test from "node:test";
import assert from "node:assert/strict";
import { createSubmissionUiState, submissionUiReducer } from "./ui-state";

test("submission UI state has stable defaults for submit and draft flags", () => {
  const state = createSubmissionUiState();
  assert.equal(state.isSubmitting, false);
  assert.equal(state.hasManualEdit, false);
  assert.equal(state.appealReason, "超过 72 小时，需要补交数据");
});

test("submission UI reducer updates related business flags immutably", () => {
  const state = createSubmissionUiState();
  const next = submissionUiReducer(state, {
    type: "update",
    updater: (current) => ({
      ...current,
      isSubmitting: true,
      hasManualEdit: true,
      qualityCheck: { data: null, loading: true },
    }),
  });
  assert.equal(next.isSubmitting, true);
  assert.equal(next.hasManualEdit, true);
  assert.equal(next.qualityCheck.loading, true);
  assert.equal(state.isSubmitting, false);
});
