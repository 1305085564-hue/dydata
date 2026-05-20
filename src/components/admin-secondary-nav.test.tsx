import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecondaryNav, getAdminSecondaryNavItems } from "./admin-secondary-nav";

test("日常管理组为管理员输出完整入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin", canManageViolations: true, canViewConversion: true, group: "daily" }).map((item) => item.label),
    ["今日待办", "经营分析", "内容复盘", "视频素材", "转化中心", "违规复核"],
  );
});

test("团队管理二级导航不再输出系统设置类入口", () => {
  const ownerItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: true, userRole: "owner" }).map((item) => item.label);
  const adminItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: true, userRole: "admin" }).map((item) => item.label);
  const leaderItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: false, userRole: "admin" }).map((item) => item.label);

  assert.equal(ownerItems.includes("成员权限"), false);
  assert.equal(ownerItems.includes("AI 配置"), false);
  assert.equal(adminItems.includes("成员权限"), false);
  assert.equal(leaderItems.includes("成员权限"), false);
});

test("后台二级导航对 member 不输出后台入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: false }).map((item) => item.href),
    [],
  );
});

test("后台二级导航只给 owner 或违规复核管理员显示违规复核", () => {
  assert.equal(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin" }).some((item) => item.href === "/admin/violations"),
    false,
  );
  assert.equal(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin", canManageViolations: true }).some(
      (item) => item.href === "/admin/violations",
    ),
    true,
  );
  assert.equal(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "owner" }).some((item) => item.href === "/admin/violations"),
    true,
  );
});

test("转化中心需要转化或违规权限", () => {
  assert.equal(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin" }).some((item) => item.href === "/admin/conversion-hub"),
    false,
  );
  assert.equal(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin", canViewConversion: true }).some((item) => item.href === "/admin/conversion-hub"),
    true,
  );
});

test("后台二级导航会标记当前激活入口并渲染说明", () => {
  const html = renderToStaticMarkup(
    <AdminSecondaryNav pathname="/admin/analytics" canManageAdmin userRole="owner" canViewConversion canManageViolations />,
  );

  assert.match(html, /后台二级导航/);
  assert.match(html, /经营分析/);
  assert.match(html, /查看经营数据、视频表现与趋势/);
  assert.match(html, /aria-current="page"/);
});
