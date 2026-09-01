import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/nav-bar-client.tsx"), "utf8");

test("主导航与顶部按钮暴露清晰的语义标签", () => {
  const tabBarSource = readFileSync(resolve(process.cwd(), "src/components/mobile-tab-bar.tsx"), "utf8");
  const moreDrawerSource = readFileSync(resolve(process.cwd(), "src/components/mobile-more-drawer.tsx"), "utf8");
  assert.match(source, /aria-label="行动中枢：待办、审批与风险"/);
  assert.match(source, /aria-label="主导航"/);
  assert.match(source, /aria-current=\{isGroupActive \? "page" : undefined\}/);
  assert.match(tabBarSource, /aria-label="移动端主导航"/);
  assert.match(tabBarSource, /aria-expanded=\{isMoreOpen\}/);
  assert.match(tabBarSource, /aria-controls="mobile-navigation-menu"/);
  assert.match(moreDrawerSource, /aria-label="打开行动中枢：待办、审批与风险"/);
});

test("工作账号与行动中枢入口保留键盘可达和无障碍属性", () => {
  const workspace = readFileSync(resolve(process.cwd(), "src/components/workspace-picker.tsx"), "utf8");
  const persona = readFileSync(resolve(process.cwd(), "src/components/user-workspace-popover.tsx"), "utf8");

  assert.match(workspace, /aria-expanded=\{isOpen\}/);
  assert.match(workspace, /aria-controls=\{menuId\}/);
  assert.match(workspace, /role="group" aria-label="工作账号列表"/);
  assert.match(persona, /aria-expanded=\{isOpen\}/);
  assert.match(persona, /aria-controls=\{menuId\}/);
});

test("行动中枢点击后先打开面板再刷新远端数据", () => {
  const openIndex = source.indexOf("setCommandHubOpen(true)");
  const refreshIndex = source.indexOf("syncActionCenterSummary({ force: true })");

  assert.notEqual(openIndex, -1);
  assert.notEqual(refreshIndex, -1);
  assert.ok(openIndex < refreshIndex);
  assert.match(source, /\/api\/action-center\/summary/);
  assert.doesNotMatch(source, /\/api\/exemptions\/pending/);
});
