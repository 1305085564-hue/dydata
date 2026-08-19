import assert from "node:assert/strict";
import test from "node:test";

import { hasExemptionManagementPermission } from "./exemption-permissions";

test("旧 owner 名称不能绕过豁免权限", () => {
  assert.equal(hasExemptionManagementPermission("owner", {}), false);
});

test("manage_fulfillment 或 review_violations 可以管理豁免", () => {
  assert.equal(hasExemptionManagementPermission("admin", { manage_fulfillment: true }), true);
  assert.equal(hasExemptionManagementPermission("admin", { review_violations: true }), true);
});

test("没有豁免权限的管理员不能管理豁免", () => {
  assert.equal(hasExemptionManagementPermission("admin", {}), false);
  assert.equal(hasExemptionManagementPermission("admin", { manage_members: true }), false);
});
