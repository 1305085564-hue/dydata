import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items";

test("管理员导航包含团队管理和系统设置入口", () => {
  const items = getNavItems({ showAdmin: true, showSystemSettings: true, showYike: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/yike", label: "此刻" },
      { href: "/dashboard", label: "今日工作台" },
      { href: "/growth", label: "个人成长" },
      { href: "/violations", label: "导粉中心" },
      { href: "/video-review", label: "视频审核" },
      { href: "/content-tools/rewrite", label: "文案助手" },
      { href: "/admin/content", label: "内容中心" },
    ]
  );
});

test("非管理员看不到团队管理和系统设置入口", () => {
  const items = getNavItems({ showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/violations", "/video-review", "/content-tools/rewrite"]
  );
});

test("未授予 AI 文案权限时隐藏文案助手入口", () => {
  const items = getNavItems({ showAdmin: false, showAiCopywriting: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/violations", "/video-review"]
  );
});

test("负责人和 owner 显示系统设置", () => {
  const withSettings = getNavItems({ showAdmin: true, showSystemSettings: true });
  const withoutSettings = getNavItems({ showAdmin: true, showSystemSettings: false });

  assert.equal(
    withSettings.some((item) => item.href === "/admin/content"),
    true
  );
  assert.equal(
    withoutSettings.some((item) => item.href === "/admin/content"),
    true
  );
});

test("只有明确允许时显示此刻入口", () => {
  assert.equal(
    getNavItems({ showAdmin: false }).some((item) => item.href === "/yike"),
    false,
  );
  assert.equal(
    getNavItems({ showAdmin: false, showYike: true }).some((item) => item.href === "/yike"),
    true,
  );
});
