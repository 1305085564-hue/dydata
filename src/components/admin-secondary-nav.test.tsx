import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecondaryNav, getAdminSecondaryNavItems } from "./admin-secondary-nav";

test("日常管理组对管理员输出核心入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: true, userRole: "admin", group: "daily" }).map((item) => item.label),
    ["今日待办", "经营分析", "批改台", "素材库", "发布履约"],
  );
});

test("团队管理二级导航不输出系统设置类入口", () => {
  const ownerItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: true, userRole: "owner" }).map((item) => item.label);
  const adminItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: true, userRole: "admin" }).map((item) => item.label);
  const leaderItems = getAdminSecondaryNavItems({ canManageAdmin: true, canManageMembers: false, userRole: "admin" }).map((item) => item.label);

  for (const items of [ownerItems, adminItems, leaderItems]) {
    assert.equal(items.includes("成员权限"), false);
    assert.equal(items.includes("团队分组"), false);
    assert.equal(items.includes("AI 配置"), false);
    assert.equal(items.includes("转化中心"), false);
    assert.equal(items.includes("案例复核"), false);
    assert.equal(items.includes("合规审核"), false);
    assert.equal(items.includes("违规复核"), false);
  }
});

test("后台二级导航对 member 不输出后台入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: false }).map((item) => item.href),
    [],
  );
});

test("/admin/violations 与 /admin/conversion-hub 不再出现在团队管理侧边", () => {
  const items = getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "owner" }).map((item) => item.href);
  assert.equal(items.includes("/admin/violations"), false);
  assert.equal(items.includes("/admin/conversion-hub"), false);
});

test("后台二级导航会标记当前激活入口并渲染说明", () => {
  const html = renderToStaticMarkup(
    <AdminSecondaryNav pathname="/admin/analytics" canManageAdmin userRole="owner" />,
  );

  assert.match(html, /后台二级导航/);
  assert.match(html, /经营分析/);
  assert.match(html, /查看经营数据、视频表现与趋势/);
  assert.match(html, /aria-current="page"/);
});
