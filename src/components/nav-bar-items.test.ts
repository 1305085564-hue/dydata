import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items.ts";

test("管理员导航顺序为爆款分析、内容管理、后台管理", () => {
  const items = getNavItems({ showAnalytics: true, showAdmin: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "数据填报" },
      { href: "/growth", label: "成长分析" },
      { href: "/analytics", label: "爆款分析" },
      { href: "/admin/content", label: "内容管理" },
      { href: "/admin", label: "后台管理" },
    ]
  );
});

test("非管理员只显示公开导航项", () => {
  const items = getNavItems({ showAnalytics: true, showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/analytics"]
  );
});
