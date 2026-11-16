import assert from "node:assert/strict";
import test from "node:test";
import { resolvePanelSubmittedState } from "./panel-state";

test("审批自动续交复用正常提交的父面板成功态", () => {
  assert.deepEqual(resolvePanelSubmittedState(), {
    submittedViewActive: true,
    requestedMode: null,
  });
});
