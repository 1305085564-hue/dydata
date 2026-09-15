import assert from "node:assert/strict";
import test from "node:test";

import { canAccessRoute } from "./route-permissions";

test("后台路由统一按业务权限放行，并覆盖子路由", () => {
  assert.equal(canAccessRoute("/admin/content", { review_content: true }), true);
  assert.equal(canAccessRoute("/admin/content/video-1", { review_content: true }), true);
  assert.equal(canAccessRoute("/admin/settings", { manage_members: true }), false);
  assert.equal(canAccessRoute("/admin/settings/security", { manage_system: true }), true);
});

test("岗位管理保留成员只读入口，AI 配置仍属于系统设置权限", () => {
  assert.equal(canAccessRoute("/admin/collaboration", { view_analytics: true }), true);
  assert.equal(canAccessRoute("/admin/collaboration/person", { view_conversion: true }), false);
  assert.equal(canAccessRoute("/admin/ai-config", { manage_system: true }), true);
  assert.equal(canAccessRoute("/admin/ai-config", { use_ai_assist: true }), false);
});

test("后台根入口不把成员的个人分析或导出权限误判成管理权限", () => {
  assert.equal(canAccessRoute("/admin", { view_analytics: true, export_data: true }), false);
  assert.equal(canAccessRoute("/admin", { review_content: true }), true);
  assert.equal(canAccessRoute("/admin/unknown", { manage_system: true }), false);
});
