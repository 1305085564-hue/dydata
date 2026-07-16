import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items";

test("管理员统一主导航合并包含日常管理入口", () => {
  const items = getNavItems({ showAdmin: true, showSystemSettings: true, businessRole: "owner" });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "今日工作台" },
      { href: "/growth", label: "成长大盘" },
      { href: "/topics/today", label: "选题库" },
      { href: "/content-tools/rewrite", label: "文案助手" },
      { href: "/admin/content", label: "视频复盘" },
      { href: "/admin/videos", label: "素材库" },
      { href: "/admin/analytics", label: "经营分析" },
      { href: "/admin/fulfillment", label: "发布履约" },
    ]
  );
});

test("非管理员看不到管理端入口", () => {
  const items = getNavItems({ showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/topics/today", "/content-tools/rewrite"]
  );
});

test("统一主导航按具体权限暴露管理入口", () => {
  const contentOnly = getNavItems({
    showAdmin: true,
    businessRole: "member",
    permissions: { view_content_review: true },
  });
  assert.deepEqual(
    contentOnly.map((item) => item.href),
    ["/dashboard", "/growth", "/topics/today", "/content-tools/rewrite", "/admin/content"],
  );

  const videosOnly = getNavItems({
    showAdmin: true,
    businessRole: "member",
    permissions: { manage_video_assets: true },
  });
  assert.deepEqual(
    videosOnly.map((item) => item.href),
    ["/dashboard", "/growth", "/topics/today", "/content-tools/rewrite", "/admin/videos"],
  );

  const fulfillmentOnly = getNavItems({
    showAdmin: true,
    businessRole: "member",
    permissions: { view_all_data: true },
  });
  assert.deepEqual(
    fulfillmentOnly.map((item) => item.href),
    [
      "/dashboard",
      "/growth",
      "/topics/today",
      "/content-tools/rewrite",
      "/admin/analytics",
      "/admin/fulfillment",
    ],
  );
});

test("未授予 AI 文案权限时隐藏文案助手入口", () => {
  const items = getNavItems({ showAdmin: false, showAiCopywriting: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/topics/today"]
  );
});

test("showSystemSettings 不影响主导航项列表", () => {
  const withSettings = getNavItems({ showAdmin: true, showSystemSettings: true, businessRole: "owner" });
  const withoutSettings = getNavItems({ showAdmin: true, showSystemSettings: false, businessRole: "owner" });

  assert.deepEqual(
    withSettings.map((item) => item.href),
    [
      "/dashboard",
      "/growth",
      "/topics/today",
      "/content-tools/rewrite",
      "/admin/content",
      "/admin/videos",
      "/admin/analytics",
      "/admin/fulfillment",
    ],
  );
  assert.deepEqual(
    withoutSettings.map((item) => item.href),
    [
      "/dashboard",
      "/growth",
      "/topics/today",
      "/content-tools/rewrite",
      "/admin/content",
      "/admin/videos",
      "/admin/analytics",
      "/admin/fulfillment",
    ],
  );
});
