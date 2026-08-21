import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/nav-bar-client.tsx"), "utf8");

test("主导航与顶部按钮暴露清晰的语义标签", () => {
  assert.match(source, /aria-label="待办与通知中心"/);
  assert.match(source, /aria-label="导航菜单"/);
  assert.match(source, /aria-current=\{isGroupActive \? "page" : undefined\}/);
  assert.match(source, /aria-expanded=\{isMobileMenuOpen\}/);
  assert.match(source, /aria-controls="mobile-navigation-menu"/);
});

test("工作账号与通知入口保留键盘可达和无障碍属性", () => {
  const workspace = readFileSync(resolve(process.cwd(), "src/components/workspace-picker.tsx"), "utf8");
  const persona = readFileSync(resolve(process.cwd(), "src/components/user-workspace-popover.tsx"), "utf8");

  assert.match(workspace, /aria-expanded=\{isOpen\}/);
  assert.match(workspace, /aria-controls=\{menuId\}/);
  assert.match(workspace, /role="group" aria-label="工作账号列表"/);
  assert.match(persona, /aria-expanded=\{isOpen\}/);
  assert.match(persona, /aria-controls=\{menuId\}/);
});
