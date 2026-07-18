import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("全局布局不在首屏静态引入选题录入器", () => {
  const layout = readSource("src/app/(app)/layout.tsx");

  assert.match(layout, /DeferredGlobalTopicCreate/);
  assert.doesNotMatch(layout, /import \{ GlobalTopicCreate \}/);
});

test("导航栏只在首次打开后加载命令中心和设置弹窗", () => {
  const nav = readSource("src/components/nav-bar-client.tsx");

  assert.match(nav, /dynamic\(\s*\(\) => import\("@\/components\/unified-command-hub"\)/);
  assert.match(nav, /dynamic\(\s*\(\) => import\("@\/components\/premium-settings-modal"\)/);
  assert.match(nav, /commandHubLoaded &&/);
  assert.match(nav, /settingsLoaded &&/);
});
