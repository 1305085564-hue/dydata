import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// 2026-11-19 外框改版：顶栏、页头、正文共用一条左边线（美学宝典 §4.3），且外框不自己动。

test("顶栏与正文同一条轨道：页面声明 data-app-rail，顶栏读 --app-rail，外层内边距与 main 相同", () => {
  const header = read("src/components/navigation/navigation-header.tsx");
  const layout = read("src/app/(app)/layout.tsx");
  const shell = read("src/components/admin-workspace-layout.tsx");
  const css = read("src/styles/components/app-shell.css");

  assert.match(header, /max-w-\[var\(--app-rail,80rem\)\]/);
  assert.match(header, /className="px-3\.5 sm:px-6"/);
  assert.match(layout, /app-main[^"]*px-3\.5[^"]*sm:px-6/);
  assert.match(shell, /data-app-rail=\{width\}/);
  assert.match(css, /--app-rail: 80rem;/);
  assert.match(css, /\.app-shell:has\(\[data-app-rail="normal"\]\)\s*\{\s*--app-rail: 64rem;/);
});

test("手机不放顶栏：顶栏只在 md 以上显示，手机顶部偏移归零", () => {
  const header = read("src/components/navigation/navigation-header.tsx");
  const tokens = read("src/styles/tokens.css");
  assert.match(header, /hidden[^"]*md:block/);
  assert.match(tokens, /@media \(max-width: 767\.98px\)[\s\S]*--app-nav-height: 0px;/);
});

test("顶栏导航只有字，当前页只用一种记号（浅砂底 + 深字）", () => {
  const menu = read("src/components/navigation/desktop-nav-menu.tsx");
  assert.doesNotMatch(menu, /group\.icon|child\.icon|GroupIcon/);
  assert.doesNotMatch(menu, /shadow-input|h-\[2px\]|text-status-info|active:scale/);
  assert.match(menu, /const ITEM_ON = "bg-\[#F1F1F0\] text-\[#141413\]";/);
});
