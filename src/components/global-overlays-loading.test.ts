import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("全局布局不再挂载已下线的手动选题录入器", () => {
  const layout = readSource("src/app/(app)/layout.tsx");

  assert.doesNotMatch(layout, /DeferredGlobalTopicCreate|GlobalTopicCreate/);
  assert.doesNotMatch(layout, /import \{ GlobalTopicCreate \}/);
});

test("导航栏只在首次打开后加载命令中心和设置弹窗", () => {
  const nav = [
    readSource("src/components/navigation/navigation-shell.tsx"),
    readSource("src/components/navigation/action-center-controls.tsx"),
  ].join("\n");

  assert.match(
    nav,
    /dynamic\(\s*\(\)\s*=>\s*import\("@\/components\/unified-command-hub"\)/,
  );
  assert.match(
    nav,
    /dynamic\(\s*\(\)\s*=>\s*import\("@\/components\/premium-settings-modal"\)/,
  );
  assert.match(nav, /commandHubLoaded &&/);
  assert.match(nav, /settingsLoaded &&/);
});

test("审批工作台挂到 body，不被导航栏 backdrop-blur 的包含块困住", () => {
  // 回归：导航栏带 backdrop-filter，会给 position:fixed 建包含块。
  // 工作台若留在 nav 内，fixed inset-0 会按 63px 高的导航条定位（实测面板 top ≈ -329px）。
  const controls = readSource("src/components/navigation/action-center-controls.tsx");

  assert.match(controls, /createPortal\(\s*<UnifiedCommandHub/);
  assert.match(controls, /document\.body/);
});
