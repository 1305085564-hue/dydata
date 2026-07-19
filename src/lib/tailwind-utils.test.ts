import test from "node:test";
import assert from "node:assert/strict";

import { badgeClass, buttonClass, cardClass, glassClass } from "./tailwind-utils";

test("cardClass 默认返回可悬停玻璃卡片 class", () => {
  const result = cardClass();

  assert.match(result, /glass-card/);
  assert.match(result, /rounded-2xl/);
});

test("cardClass 可切换为静态卡片", () => {
  const result = cardClass(false);

  assert.match(result, /glass-card-static/);
  assert.doesNotMatch(result, /glass-card(?!-static)/);
});

test("glassClass 返回统一毛玻璃样式", () => {
  const result = glassClass();

  assert.match(result, /backdrop-blur/);
  assert.match(result, /bg-\[var\(--glass-bg\)\]/);
});

test("buttonClass 复用现有按钮 variants", () => {
  const primary = buttonClass("default", "lg");
  const ghost = buttonClass("ghost", "sm");

  assert.match(primary, /bg-\[#D97757\]/);
  assert.match(primary, /h-9/);
  assert.match(ghost, /hover:bg-stone-100/);
  assert.match(ghost, /h-7/);
});

test("badgeClass 根据语义色返回对应 badge class", () => {
  assert.match(badgeClass("primary"), /bg-primary/);
  assert.match(badgeClass("success"), /text-\[#6FAA7D\]/);
  assert.match(badgeClass("success"), /dark:text-\[#6FAA7D\]/);
  assert.match(badgeClass("warning"), /text-\[#D99E55\]/);
  assert.match(badgeClass("warning"), /dark:text-\[#D99E55\]/);
  assert.match(badgeClass("danger"), /text-\[#C9604D\]/);
  assert.match(badgeClass("danger"), /dark:text-\[#C9604D\]/);
  assert.match(badgeClass("neutral"), /border-border/);
});
