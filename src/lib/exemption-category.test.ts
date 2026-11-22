import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminExemptionCategoryLabel,
  getEmployeeExemptionCategoryLabel,
  normalizeExemptionCategory,
  toExemptionCategory,
} from "./exemption-category";

test("历史 NULL 分类按统一兼容策略归一为 waive，管理侧与员工侧展示文案保持各自口径", () => {
  assert.equal(toExemptionCategory("leave"), "leave");
  assert.equal(toExemptionCategory("waive"), "waive");
  assert.equal(toExemptionCategory(null), null);
  assert.equal(toExemptionCategory("unknown"), null);

  assert.equal(normalizeExemptionCategory(null), "waive");
  assert.equal(normalizeExemptionCategory("leave"), "leave");
  assert.equal(normalizeExemptionCategory("waive"), "waive");

  assert.equal(getEmployeeExemptionCategoryLabel(null), "免交");
  assert.equal(getEmployeeExemptionCategoryLabel("leave"), "请假");
  assert.equal(getEmployeeExemptionCategoryLabel("waive"), "免交");

  assert.equal(getAdminExemptionCategoryLabel(null), "免交（历史兼容）");
  assert.equal(getAdminExemptionCategoryLabel("leave"), "请假");
  assert.equal(getAdminExemptionCategoryLabel("waive"), "免交");
});
