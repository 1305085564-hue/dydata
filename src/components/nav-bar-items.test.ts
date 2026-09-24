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

test("member 显示工作台、选题库与洞察组（含数据分析和数据管理），隐藏无权管理入口", () => {
  assert.deepEqual(hrefs("member"), [
    "/dashboard",
    "/topics",
    "/growth",
    "/admin/collaboration",
  ]);

  const groups = getNavGroups({
    showAdmin: true,
    permissions: fixedPermissionsForRole("member"),
  });
  assert.deepEqual(groups.map((group) => group.key), [
    "dashboard",
    "topics",
    "insights",
  ]);
  const insightsGroup = groups.find((group) => group.key === "insights");
  assert.deepEqual(insightsGroup?.children?.map((child) => child.label), ["数据分析", "数据管理"]);
});

test("admin 显示已授权业务页面和成员管理，不显示系统设置与 AI 配置", () => {
  assert.deepEqual(hrefs("admin"), [
    "/dashboard",
    "/topics",
    "/growth",
    "/admin/content",
    "/admin/collaboration",
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
    "/growth",
    "/admin/content",
    "/admin/collaboration",
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

test("没有任何权限时隐藏空的业务入口，但保留登录可见的数据分析", () => {
  const groups = getNavGroups({ showAdmin: true, permissions: {} });

  assert.deepEqual(groups.map((group) => group.key), ["dashboard", "topics", "insights"]);
  assert.deepEqual(groups[2]?.children?.map((child) => child.label), ["数据分析"]);
});
