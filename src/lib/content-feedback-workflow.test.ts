import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTENT_FEEDBACK_DELIVERY_ENABLED,
  buildDeliveryDisabledPayload,
  isContentFeedbackDeliveryAction,
} from "./content-feedback-workflow";

test("content feedback delivery switch pauses only delivery actions", () => {
  assert.equal(CONTENT_FEEDBACK_DELIVERY_ENABLED, false);
  assert.equal(isContentFeedbackDeliveryAction("save_draft"), false);
  assert.equal(isContentFeedbackDeliveryAction("confirm"), false);
  assert.equal(isContentFeedbackDeliveryAction("send"), true);
  assert.equal(isContentFeedbackDeliveryAction("confirm_and_send"), true);
  assert.equal(isContentFeedbackDeliveryAction("create_confirm_send"), true);
});

test("delivery disabled payload tells caller to keep draft and copy out", () => {
  assert.deepEqual(buildDeliveryDisabledPayload(), {
    ok: false,
    delivery_disabled: true,
    error: "站内下发流程已暂停，请先保存草稿并复制建议到飞书。",
  });
});
