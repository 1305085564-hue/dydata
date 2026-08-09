import test from "node:test";
import assert from "node:assert/strict";

import { getFeedbackCardViewedErrorMessage } from "./feedback-detail-dialog";

test("站内下发暂停时不显示确认失败提示", () => {
  assert.equal(getFeedbackCardViewedErrorMessage({ delivery_disabled: true }), "站内下发已暂停");
  assert.equal(getFeedbackCardViewedErrorMessage({}), null);
});
