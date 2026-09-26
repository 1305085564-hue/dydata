import assert from "node:assert/strict";
import test from "node:test";

import { canAccessRoute, canReadWorkVideo, WORK_VIDEO_READ_PERMISSIONS } from "./route-permissions";
import { fixedPermissionsForRole } from "./company-permissions";
import { PERMISSION_CONTRACT } from "./permission-contract";

test("后台路由统一按业务权限放行，并覆盖子路由", () => {
  assert.equal(canAccessRoute("/admin/content", { review_content: true }), true);
  assert.equal(canAccessRoute("/admin/content/video-1", { review_content: true }), true);
  assert.equal(canAccessRoute("/admin/settings", { manage_members: true }), false);
  assert.equal(canAccessRoute("/admin/settings/security", { manage_system: true }), true);
});

test("数据管理保留成员只读入口，AI 配置仍属于系统设置权限", () => {
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

test("作品复盘只读键不授予 /admin/content 页面入口", () => {
  const memberPermissions = fixedPermissionsForRole("member");

  assert.equal(memberPermissions.view_video_review, true);
  assert.equal(canReadWorkVideo(memberPermissions), true);
  assert.equal(canAccessRoute("/admin/content", memberPermissions), false);
  // 页面门禁仍只认 review_content / manage_videos
  assert.deepEqual(
    [...WORK_VIDEO_READ_PERMISSIONS].sort(),
    ["manage_videos", "review_content", "view_video_review"],
  );
  assert.equal(
    PERMISSION_CONTRACT.roles.member.includes("review_content"),
    false,
  );
});

test("作品复盘只读键不激活 review_content 的选题库联动能力", () => {
  const memberPermissions = fixedPermissionsForRole("member");

  assert.equal(memberPermissions.review_content, undefined);
  assert.equal(memberPermissions.manage_videos, undefined);
  assert.equal(memberPermissions.manage_fulfillment, undefined);
  assert.equal(memberPermissions.manage_members, undefined);
});

test("作品复盘只读键不进入后台根入口门禁", () => {
  assert.equal(canAccessRoute("/admin", { view_analytics: true, view_video_review: true }), false);
  assert.equal(canAccessRoute("/admin", { review_content: true }), true);
});
