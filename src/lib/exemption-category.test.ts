import assert from "node:assert/strict";
import test from "node:test";

import {
  getExemptionCategoryLabel,
  normalizeExemptionCategoryForDisplay,
} from "./exemption-category";

test("历史 NULL 分类按统一兼容策略显示为免交，而不是误标请假", () => {
  assert.equal(normalizeExemptionCategoryForDisplay(null), "waive");
  assert.equal(getExemptionCategoryLabel(null), "免交（历史兼容）");
  assert.equal(getExemptionCategoryLabel("leave"), "请假");
  assert.equal(getExemptionCategoryLabel("waive"), "免交");
});
