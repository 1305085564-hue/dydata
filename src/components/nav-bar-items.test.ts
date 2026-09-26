import test from "node:test";
import assert from "node:assert/strict";

import { fixedPermissionsForRole } from "@/lib/company-permissions";
import { getNavGroups, getNavItems } from "./nav-bar-items";

function hrefs(role: "member" | "admin" | "company_owner") {
  return getNavItems({
    showAdmin: true,
    permissions: fixedPermissionsForRole(role),
  }).map((item) => item.href);
}

test("member 显示数据管理，管理中心因无可见子项而隐藏", () => {
  assert.deepEqual(hrefs("member"), [
    "/dashboard",
    "/topics",
    "/admin/collaboration",
  ]);

  const groups = getNavGroups({
    showAdmin: true,
    permissions: fixedPermissionsForRole("member"),
  });
  assert.deepEqual(groups.map((group) => group.key), [
    "dashboard",
    "topics",
    "data-management",
  ]);
});

test("admin 显示已授权业务页面和成员管理，不显示系统设置与 AI 配置", () => {
  assert.deepEqual(hrefs("admin"), [
    "/dashboard",
    "/topics",
    "/admin/content",
    "/admin/collaboration",
    "/content-tools/rewrite",
    "/admin/fulfillment",
    "/admin/modules",
  ]);

  const items = hrefs("admin");
  assert.equal(items.includes("/admin/settings"), false);
  assert.equal(items.includes("/admin/ai-config"), false);
});

test("owner 和 company_owner 显示全部仍在用的页面入口", () => {
  const expected = [
    "/dashboard",
    "/topics",
    "/admin/content",
    "/admin/collaboration",
    "/content-tools/rewrite",
    "/admin/fulfillment",
    "/admin/modules",
    "/admin/ai-config",
    "/admin/settings",
  ];

  assert.deepEqual(hrefs("company_owner"), expected);
  assert.deepEqual(
    getNavItems({ showAdmin: true, permissions: fixedPermissionsForRole("owner") }).map((item) => item.href),
    expected,
  );

  const ownerLabels = getNavItems({
    showAdmin: true,
    permissions: fixedPermissionsForRole("company_owner"),
  }).map((item) => item.label);
  assert.equal(ownerLabels.includes("系统设置"), true);
  assert.equal(ownerLabels.includes("系统维护"), false);
});

test("没有任何权限时只保留登录可见的基础入口", () => {
  const groups = getNavGroups({ showAdmin: true, permissions: {} });

  assert.deepEqual(groups.map((group) => group.key), ["dashboard", "topics"]);
});
