import test from "node:test";
import assert from "node:assert/strict";

import { isManagementPath, shouldShowAdminCenterNav } from "./nav-mode";

test("所有 /admin 路径都算管理态，避免和右上角切换冲突", () => {
  assert.equal(isManagementPath("/admin/content"), true);
  assert.equal(isManagementPath("/admin/modules"), true);
  assert.equal(isManagementPath("/admin/ai-config"), true);
  assert.equal(isManagementPath("/dashboard"), false);
});

test("内容中心主导航只在核心管理页展示，系统维护页不混入主导航", () => {
  assert.equal(shouldShowAdminCenterNav("/admin/content"), true);
  assert.equal(shouldShowAdminCenterNav("/admin/videos"), true);
  assert.equal(shouldShowAdminCenterNav("/admin/modules"), false);
  assert.equal(shouldShowAdminCenterNav("/admin/ai-config"), false);
});
