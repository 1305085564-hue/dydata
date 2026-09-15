import assert from "node:assert/strict";
import test from "node:test";

import { hasExemptionManagementPermission } from "./exemption-permissions";

test("空权限不能绕过豁免管理", () => {
  assert.equal(hasExemptionManagementPermission({}), false);
});

test("manage_fulfillment 或 review_violations 可以管理豁免", () => {
  assert.equal(hasExemptionManagementPermission({ manage_fulfillment: true }), true);
  assert.equal(hasExemptionManagementPermission({ review_violations: true }), true);
});

test("没有豁免权限的管理员不能管理豁免", () => {
  assert.equal(hasExemptionManagementPermission({}), false);
  assert.equal(hasExemptionManagementPermission({ manage_members: true }), false);
});
