import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("根样式不再包含登录后页面专用 CSS", () => {
  const globals = readSource("src/app/globals.css");

  assert.doesNotMatch(globals, /components\/app-shell\.css/);
  assert.doesNotMatch(globals, /components\/dashboard\.css/);
  assert.doesNotMatch(globals, /components\/admin\.css/);
});

test("各级布局只加载自己需要的 CSS", () => {
  const appLayout = readSource("src/app/(app)/layout.tsx");
  assert.match(appLayout, /styles\/components\/app-shell\.css/);
  assert.match(appLayout, /styles\/components\/dashboard\.css/);
  assert.match(readSource("src/app/(app)/admin/layout.tsx"), /styles\/components\/admin\.css/);
});

test("跨登录后路由共享的样式不被错误缩到 Dashboard", () => {
  const dashboard = readSource("src/styles/components/dashboard.css");
  assert.match(dashboard, /\.glass-chip/);
  assert.match(dashboard, /\.glass-card-static/);
  assert.match(dashboard, /\.animate-shake/);
  assert.match(dashboard, /\.animate-pulse-soft/);
});

test("后台导航不再依赖 Dashboard 专用选择器", () => {
  const source = readSource("src/components/admin-secondary-nav.tsx");
  assert.doesNotMatch(source, /dashboard-/);
});
