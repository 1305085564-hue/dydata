import test from "node:test";
import assert from "node:assert/strict";

import { getNavItems } from "./nav-bar-items";

test("管理员主导航不再单独暴露内容中心入口", () => {
  const items = getNavItems({ showAdmin: true, showSystemSettings: true });

  assert.deepEqual(
    items.map((item) => ({ href: item.href, label: item.label })),
    [
      { href: "/dashboard", label: "今日工作台" },
      { href: "/growth", label: "个人成长" },
      { href: "/violations", label: "导粉中心" },
      { href: "/video-review", label: "视频审核" },
      { href: "/content-tools/rewrite", label: "文案助手" },
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

test("showAdmin 不再影响主导航项列表", () => {
  const withSettings = getNavItems({ showAdmin: true, showSystemSettings: true });
  const withoutSettings = getNavItems({ showAdmin: true, showSystemSettings: false });

  assert.deepEqual(
    withSettings.map((item) => item.href),
    withoutSettings.map((item) => item.href),
  );
});
