import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import { canAccessRoute, canReadWorkVideo, ROUTE_PERMISSIONS } from "./route-permissions";
import { fixedPermissionsForRole } from "./company-permissions";
import type { Permissions } from "@/types";

// 只枚举文件名，不读取页面源码；新挂载页面会自动成为一个实际权限契约用例。
const appRoot = resolve(process.cwd(), "src/app/(app)");
const adminRoot = resolve(appRoot, "admin");
const pages = readdirSync(adminRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name === "page.tsx")
  .map((entry) => `/${relative(appRoot, entry.parentPath).split(sep)
    .filter((part) => !part.startsWith("(") && !part.startsWith("@"))
    .map((part) => part.startsWith("[") ? "inventory-example" : part).join("/")}`)
  .sort();

test("管理页面清点确实发现页面，避免扫描路径错误造成零用例", () => {
  assert.ok(pages.length > 1);
  assert.ok(pages.includes("/admin/settings"));
});

for (const page of pages) {
  test(`${page} 已登记权限，有权可进、无权拒绝`, () => {
    const registration = Object.keys(ROUTE_PERMISSIONS)
      .sort((a, b) => b.length - a.length)
      .find((route) => page === route || (route !== "/admin" && page.startsWith(`${route}/`)));
    assert.ok(registration, `${page} 未登记 ROUTE_PERMISSIONS`);
    const keys = ROUTE_PERMISSIONS[registration];
    assert.ok(keys.length > 0, `${page} 权限登记不能为空`);
    for (const key of keys) assert.equal(canAccessRoute(page, { [key]: true }), true);
    assert.equal(canAccessRoute(page, {}), false);
    assert.equal(canAccessRoute(page, Object.fromEntries(keys.map((key) => [key, false]))), false);
  });
}

for (const path of ["/unknown", "/admin/unknown", "/admin/settings-unknown", "/administrator"]) {
  test(`未知路径 ${path} 即使持有全部管理权限也默认拒绝`, () => {
    const all: Permissions = Object.fromEntries(Object.values(ROUTE_PERMISSIONS).flat().map((key) => [key, true]));
    assert.equal(canAccessRoute(path, all), false);
  });
}

for (const key of ["review_content", "manage_videos", "view_video_review"] as const) {
  test(`${key} 可读作品，但不能绕过系统设置权限`, () => {
    assert.equal(canReadWorkVideo({ [key]: true }), true);
    assert.equal(canReadWorkVideo({ [key]: false }), false);
    assert.equal(canAccessRoute("/admin/settings", { [key]: true }), false);
  });
}

test("成员只读作品权限不扩张为管理写权限", () => {
  const member = fixedPermissionsForRole("member");
  assert.equal(canReadWorkVideo(member), true);
  assert.equal(canAccessRoute("/admin/content", member), true);
  for (const key of ["review_content", "manage_videos", "manage_members", "manage_system"] as const) {
    assert.notEqual(member[key], true);
  }
  assert.equal(canReadWorkVideo({ manage_system: true, manage_members: true }), false);
  assert.equal(canReadWorkVideo({}), false);
});
