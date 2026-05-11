import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecondaryNav, getAdminSecondaryNavItems } from "./admin-secondary-nav";

test("后台二级导航为管理员输出完整入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: true, userRole: "admin", canManageViolations: true }).map((item) => item.label),
    ["中控总览", "经营分析", "转化中心", "违规复核", "权限模块"],
  );
});

test("后台二级导航对 member 只保留经营分析", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: false }).map((item) => item.href),
    ["/admin/analytics"],
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

test("后台二级导航会标记当前激活入口并渲染说明", () => {
  const html = renderToStaticMarkup(
    <AdminSecondaryNav pathname="/admin/ai-channels" canManageAdmin userRole="owner" />,
  );

  assert.match(html, /后台二级导航/);
  assert.match(html, /AI 配置中心/);
  assert.match(html, /集中管理模型渠道、功能绑定、文案改写和执行路线/);
  assert.match(html, /aria-current="page"/);
});
