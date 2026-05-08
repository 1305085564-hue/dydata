import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items.ts";

test("管理员导航顺序为 AI 助手主入口 + 管理项", () => {
  const items = getNavItems({ showAnalytics: true, showAdmin: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "数据填报" },
      { href: "/growth", label: "成长分析" },
      { href: "/content-tools/rewrite", label: "AI助手" },
      { href: "/admin/analytics", label: "经营分析" },
      { href: "/admin/content", label: "内容管理" },
      { href: "/admin", label: "后台管理" },
    ]
  );
});

test("非管理员看不到经营分析入口", () => {
  const items = getNavItems({ showAnalytics: false, showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/content-tools/rewrite"]
  );
});
