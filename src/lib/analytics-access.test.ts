import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalyticsAccessContext,
  canAccessAdminPath,
  getNavigationAccess,
  getPresetRange,
  restrictPersonRows,
} from "./analytics-access";

test("成员没有 team_id 时保持空团队，且不能查看全部成员", () => {
  const context = buildAnalyticsAccessContext({
    userId: "user-1",
    role: "member",
    teamId: null,
  });

  assert.deepEqual(context, {
    userId: "user-1",
    role: "member",
    effectiveTeamId: null,
    canViewAllMembers: false,
  });
});

test("负责人保留真实 team_id，具备成员管理权限时可查看全部成员", () => {
  const context = buildAnalyticsAccessContext({
    userId: "admin-1",
    role: "admin",
    teamId: "team-1",
    permissions: { manage_members: true },
  });

  assert.equal(context.effectiveTeamId, "team-1");
  assert.equal(context.canViewAllMembers, true);
});

test("成员不能访问任何管理后台页面", () => {
  assert.equal(canAccessAdminPath("/admin/analytics", "member"), false);
  assert.equal(canAccessAdminPath("/admin/analytics/details", "member"), false);
  assert.equal(canAccessAdminPath("/admin", "member"), false);
  assert.equal(canAccessAdminPath("/admin/videos", "member"), false);
});

test("管理员入口按权限键放行", () => {
  assert.equal(canAccessAdminPath("/admin", "admin", { manage_members: true }), true);
  assert.equal(canAccessAdminPath("/admin/analytics", "admin", { view_analytics: true }), true);
  assert.equal(canAccessAdminPath("/admin/content", "admin", { review_content: true }), true);
  assert.equal(canAccessAdminPath("/admin/fulfillment", "admin", { manage_fulfillment: true }), true);
  assert.equal(canAccessAdminPath("/admin/settings", "admin", { manage_system: true }), true);
  assert.equal(canAccessAdminPath("/admin/modules", "admin", { manage_members: true }), true);
  assert.equal(canAccessAdminPath("/admin/settings", "admin", { manage_members: true }), false);
});

test("发布管理页面只按固定权限放行，旧 owner 名称不能绕过", () => {
  assert.equal(canAccessAdminPath("/admin/fulfillment", "owner"), false);
  assert.equal(canAccessAdminPath("/admin/fulfillment", "owner", { manage_fulfillment: true }), true);
  assert.equal(canAccessAdminPath("/admin/fulfillment", "admin", { manage_fulfillment: true }), true);
  assert.equal(canAccessAdminPath("/admin/fulfillment/detail", "admin", { manage_fulfillment: true }), true);
  assert.equal(canAccessAdminPath("/admin/fulfillment", "member", { manage_fulfillment: true }), true);
  assert.equal(canAccessAdminPath("/admin/fulfillment", "member"), false);
});

test("协作管理只按分析权限放行", () => {
  assert.equal(canAccessAdminPath("/admin/collaboration", "owner"), false);
  assert.equal(canAccessAdminPath("/admin/collaboration", "owner", { view_analytics: true }), true);
  assert.equal(canAccessAdminPath("/admin/collaboration/person", "admin", { view_analytics: true }), true);
  assert.equal(canAccessAdminPath("/admin/collaboration", "member", { view_analytics: true }), true);
  assert.equal(canAccessAdminPath("/admin/collaboration", "member"), false);
});

test("系统设置和成员管理按对应权限放行", () => {
  assert.equal(canAccessAdminPath("/admin/modules", "admin", { manage_members: true }), true);
  assert.equal(canAccessAdminPath("/admin/settings", "admin", { manage_system: true }), true);
  assert.equal(canAccessAdminPath("/admin/settings", "owner"), false);
  assert.equal(canAccessAdminPath("/admin/settings", "owner", { manage_system: true }), true);
});

test("导航权限区分成员与管理员入口", () => {
  assert.deepEqual(getNavigationAccess("member"), {
    showAnalytics: false,
    showAdmin: false,
  });

  assert.deepEqual(getNavigationAccess("admin", { view_analytics: true, manage_members: true }), {
    showAnalytics: true,
    showAdmin: true,
  });

  assert.deepEqual(getNavigationAccess("owner"), {
    showAnalytics: false,
    showAdmin: false,
  });

  assert.deepEqual(getNavigationAccess("owner", { view_analytics: true }), {
    showAnalytics: true,
    showAdmin: true,
  });
});

test("成员视角的人员明细仅保留本人，管理员保留全量", () => {
  const rows = [
    { submitter: "员工A", value: 1 },
    { submitter: "员工B", value: 2 },
    { submitter: "员工A", value: 3 },
  ];

  assert.deepEqual(restrictPersonRows(rows, { role: "member", currentUserName: "员工A" }), [
    { submitter: "员工A", value: 1 },
    { submitter: "员工A", value: 3 },
  ]);

  assert.deepEqual(restrictPersonRows(rows, { role: "admin", currentUserName: "员工A" }), rows);
});

test("时间范围预设覆盖近7天、近30天、本月与自定义", () => {
  assert.deepEqual(getPresetRange("7d", new Date("2026-03-22T12:00:00Z")), {
    from: "2026-03-16",
    to: "2026-03-22",
    preset: "7d",
  });

  assert.deepEqual(getPresetRange("30d", new Date("2026-03-22T12:00:00Z")), {
    from: "2026-02-21",
    to: "2026-03-22",
    preset: "30d",
  });

  assert.deepEqual(getPresetRange("month", new Date("2026-03-22T12:00:00Z")), {
    from: "2026-03-01",
    to: "2026-03-22",
    preset: "month",
  });

  assert.deepEqual(
    getPresetRange("custom", new Date("2026-03-22T12:00:00Z"), {
      from: "2026-03-05",
      to: "2026-03-09",
    }),
    {
      from: "2026-03-05",
      to: "2026-03-09",
      preset: "custom",
    },
  );
});
