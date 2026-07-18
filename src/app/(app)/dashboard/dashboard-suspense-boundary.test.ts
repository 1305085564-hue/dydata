import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Dashboard 页面在鉴权前就输出 Suspense 骨架", () => {
  const page = readSource("src/app/(app)/dashboard/page.tsx");

  assert.doesNotMatch(page, /auth\.getUser\(\)/);
  assert.doesNotMatch(page, /createClient/);
  assert.match(page, /<Suspense fallback=\{<DashboardLoading \/>\}>/);
  assert.match(page, /<DashboardDataContainer \/>/);
});

test("Dashboard 数据容器在骨架边界内完成鉴权", () => {
  const container = readSource("src/app/(app)/dashboard/dashboard-data-container.tsx");

  assert.match(container, /getCurrentUserContext\(\)/);
  assert.match(container, /if \(!user\) redirect\("\/login"\)/);
});

