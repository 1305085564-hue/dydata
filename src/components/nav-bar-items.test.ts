import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items";

test("管理员统一主导航合并包含日常管理入口", () => {
  const items = getNavItems({ showAdmin: true, showSystemSettings: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "今日工作台" },
      { href: "/growth", label: "成长大盘" },
      { href: "/content-tools/rewrite", label: "文案助手" },
      { href: "/admin/content", label: "视频复盘" },
      { href: "/admin/videos", label: "素材库" },
      { href: "/admin/analytics", label: "经营分析" },
    ]
  );
});

test("非管理员看不到管理端入口", () => {
  const items = getNavItems({ showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/content-tools/rewrite"]
  );
});

test("未授予 AI 文案权限时隐藏文案助手入口", () => {
  const items = getNavItems({ showAdmin: false, showAiCopywriting: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth"]
  );
});

test("showSystemSettings 不影响主导航项列表", () => {
  const withSettings = getNavItems({ showAdmin: true, showSystemSettings: true });
  const withoutSettings = getNavItems({ showAdmin: true, showSystemSettings: false });

  assert.deepEqual(
    withSettings.map((item) => item.href),
    withoutSettings.map((item) => item.href),
  );
});
