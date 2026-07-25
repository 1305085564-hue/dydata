import test from "node:test";
import assert from "node:assert/strict";

import { getNavGroups, getNavItems } from "./nav-bar-items";

test("管理员 5 大分组结构完整解析", () => {
  const groups = getNavGroups({ showAdmin: true, showSystemSettings: true, businessRole: "owner" });

  assert.deepEqual(
    groups.map((g) => ({
      key: g.key,
      label: g.label,
      href: g.href,
      children: g.children?.map((c) => ({ href: c.href, label: c.label })),
    })),
    [
      { key: "dashboard", label: "工作台", href: "/dashboard", children: undefined },
      { key: "topics", label: "选题库", href: "/topics", children: undefined },
      {
        key: "content-center",
        label: "内容中心",
        href: undefined,
        children: [
          { href: "/content-tools/rewrite", label: "文案助手" },
          { href: "/admin/content", label: "视频复盘" },
          { href: "/admin/videos", label: "素材库" },
          { href: "/admin/fulfillment", label: "发布管理" },
        ],
      },
      {
        key: "data-center",
        label: "数据中心",
        href: undefined,
        children: [
          { href: "/growth", label: "数据分析" },
          { href: "/admin/analytics", label: "经营分析" },
        ],
      },
      {
        key: "admin-center",
        label: "管理中心",
        href: undefined,
        children: [
          { href: "/admin/modules", label: "成员管理" },
          { href: "/admin/settings", label: "系统维护" },
          { href: "/admin/ai-config", label: "AI 配置" },
        ],
      },
    ]
  );
});

test("非管理员只能看到基础分组，管理中心若全无权限则自动隐藏", () => {
  const groups = getNavGroups({ showAdmin: false });

  assert.deepEqual(
    groups.map((g) => g.label),
    ["工作台", "选题库", "内容中心", "数据中心"]
  );

  const flatItems = getNavItems({ showAdmin: false });
  assert.deepEqual(
    flatItems.map((item) => item.href),
    ["/dashboard", "/topics", "/content-tools/rewrite", "/growth"]
  );
});

test("统一主导航按具体权限暴露管理子项", () => {
  const contentOnly = getNavItems({
    showAdmin: true,
    businessRole: "member",
    permissions: { view_content_review: true },
  });
  assert.deepEqual(
    contentOnly.map((item) => item.href),
    ["/dashboard", "/topics", "/content-tools/rewrite", "/admin/content", "/growth"],
  );

  const videosOnly = getNavItems({
    showAdmin: true,
    businessRole: "member",
    permissions: { manage_video_assets: true },
  });
  assert.deepEqual(
    videosOnly.map((item) => item.href),
    ["/dashboard", "/topics", "/content-tools/rewrite", "/admin/videos", "/growth"],
  );
});

test("未授予 AI 文案权限时隐藏文案助手入口", () => {
  const items = getNavItems({ showAdmin: false, showAiCopywriting: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/topics", "/growth"]
  );
});

