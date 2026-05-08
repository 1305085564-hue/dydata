import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items.ts";

test("管理员导航包含后台管理入口", () => {
  const items = getNavItems({ showAdmin: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "数据填报" },
      { href: "/growth", label: "成长分析" },
      { href: "/content-tools/rewrite", label: "AI助手" },
      { href: "/admin", label: "后台管理" },
    ]
  );
});

test("非管理员看不到后台管理入口", () => {
  const items = getNavItems({ showAdmin: false });

  assert.deepEqual(
    items.map((item) => item.href),
    ["/dashboard", "/growth", "/content-tools/rewrite"]
  );
});
