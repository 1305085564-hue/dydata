import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecondaryNav, getAdminSecondaryNavItems } from "./admin-secondary-nav";

test("后台二级导航为管理员输出 owner 配置入口", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: true }).map((item) => item.label),
    ["中控总览", "经营分析", "AI 渠道", "AI 功能区", "文案改写配置", "功能模块"],
  );
});

test("后台二级导航对 member 只保留经营分析", () => {
  assert.deepEqual(
    getAdminSecondaryNavItems({ canManageAdmin: false }).map((item) => item.href),
    ["/admin/analytics"],
  );
});

test("后台二级导航会标记当前激活入口", () => {
  const html = renderToStaticMarkup(
    <AdminSecondaryNav pathname="/admin/ai-features" canManageAdmin />,
  );

  assert.match(html, /后台二级导航/);
  assert.match(html, /AI 功能区/);
  assert.match(html, /aria-current="page"/);
});
