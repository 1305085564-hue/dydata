import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowAppealSubmitAction } from "./appeal-submit-state";

test("驳回后仍显示重新申请补交按钮", () => {
  assert.equal(
    shouldShowAppealSubmitAction({
      appealRequired: false,
      appealPrecheckRequired: false,
      appealStatus: "rejected",
      isSubmitted: false,
    }),
    true,
  );
});

test("已提交后不显示补交申请按钮", () => {
  assert.equal(
    shouldShowAppealSubmitAction({
      appealRequired: false,
      appealPrecheckRequired: false,
      appealStatus: "rejected",
      isSubmitted: true,
    }),
    false,
  );
});
