import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("公开首页不渲染通知组件，其他路由按需加载", () => {
  const layout = readSource("src/app/layout.tsx");
  const routeToaster = readSource("src/components/ui/route-toaster.tsx");

  assert.match(layout, /<RouteToaster \/>/);
  assert.doesNotMatch(layout, /<Toaster/);
  assert.match(routeToaster, /dynamic\(/);
  assert.match(routeToaster, /pathname === "\/"/);
});

test("通知组件固定使用亮色，不加载主题运行时", () => {
  const sonner = readSource("src/components/ui/sonner.tsx");
  const packageJson = readSource("package.json");

  assert.doesNotMatch(sonner, /next-themes|useTheme/);
  assert.match(sonner, /theme="light"/);
  assert.doesNotMatch(packageJson, /"next-themes"/);
});
