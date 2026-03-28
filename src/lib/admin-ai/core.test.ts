import test from "node:test";
import assert from "node:assert/strict";

import {
  determineRiskLevel,
  isHighRiskAction,
  shouldRequireConfirmation,
  assertToolIsWhitelisted,
  filterActionsByRole,
} from "./core";

test("高危工具会被标记为 high", () => {
  assert.equal(determineRiskLevel("kickUser", { batch: false, cacheType: undefined }), "high");
  assert.equal(determineRiskLevel("clearCache", { batch: false, cacheType: "all" }), "high");
  assert.equal(determineRiskLevel("getUserInfo", { batch: false, cacheType: undefined }), "low");
});

test("高危动作必须二次确认", () => {
  assert.equal(isHighRiskAction("kickUser", { batch: false, cacheType: undefined }), true);
  assert.equal(shouldRequireConfirmation("kickUser", { batch: false, cacheType: undefined }), true);
  assert.equal(shouldRequireConfirmation("getUserInfo", { batch: false, cacheType: undefined }), false);
});

test("未注册工具会被拒绝", () => {
  assert.doesNotThrow(() => assertToolIsWhitelisted("getUserInfo"));
  assert.throws(() => assertToolIsWhitelisted("nonExistingTool"), /未注册工具/);
});

test("history 权限过滤：owner 看全部，admin 仅看自己", () => {
  const rows = [
    { id: "1", admin_id: "a" },
    { id: "2", admin_id: "b" },
  ];

  assert.deepEqual(filterActionsByRole(rows, { role: "owner", userId: "a" }), rows);
  assert.deepEqual(filterActionsByRole(rows, { role: "admin", userId: "a" }), [{ id: "1", admin_id: "a" }]);
});
