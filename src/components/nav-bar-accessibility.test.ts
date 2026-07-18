import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/nav-bar-client.tsx"), "utf8");

test("系统维护弹层使用普通导航语义并由按钮控制", () => {
  assert.match(source, /aria-controls="system-maintenance-panel"/);
  assert.match(source, /<nav[\s\S]*id="system-maintenance-panel"[\s\S]*aria-label="系统维护"/);
  assert.doesNotMatch(source, /aria-haspopup="menu"/);
  assert.doesNotMatch(source, /handleWrenchMouseEnter|onMouseEnter=\{handleWrench/);
});

test("Escape 关闭系统维护弹层并把焦点还给触发按钮", () => {
  assert.match(source, /e\.key === "Escape"[\s\S]*setWrenchOpen\(false\)[\s\S]*wrenchButtonRef\.current\?\.focus\(\)/);
});
