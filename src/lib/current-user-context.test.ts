import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("登录态读取通过请求级缓存复用", () => {
  const currentUser = readSource("src/lib/current-user-context.ts");
  const permissions = readSource("src/lib/permissions.ts");
  const nav = readSource("src/components/nav-bar.tsx");
  const joinBanner = readSource("src/app/(app)/_components/join-banner-loader.ts");

  assert.match(currentUser, /cache\(async/);
  assert.match(currentUser, /authError: authResult\.error/);
  assert.match(permissions, /getCurrentUserContext\(\)/);
  assert.match(permissions, /assertSupabaseQuerySucceeded\(authError/);
  assert.match(nav, /getCurrentUserContext\(\)/);
  assert.match(joinBanner, /getCurrentUserContext\(\)/);
});

test("全局布局不等待权限，并用 Suspense 隔离导航数据", () => {
  const layout = readSource("src/app/(app)/layout.tsx");

  assert.doesNotMatch(layout, /await getUserPermissions\(\)/);
  assert.match(layout, /<Suspense/);
  assert.match(layout, /<NotificationProvider enabled>/);
});

test("导航资料和账号查询并行执行", () => {
  const nav = readSource("src/components/nav-bar.tsx");
  assert.match(nav, /Promise\.all\(/);
});
