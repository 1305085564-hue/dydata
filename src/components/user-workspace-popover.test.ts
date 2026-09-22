import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./user-workspace-popover.tsx", import.meta.url),
  "utf8",
);

test("无成员管理权限时不再无条件显示成员与团队架构链接", () => {
  assert.match(source, /canAccessTeamManagement \? \(/);
  assert.match(source, /需权限/);
});

test("有成员管理权限时仍保留成员与团队架构链接", () => {
  assert.match(source, /<a[\s\S]*href="\/admin\/modules"/);
  assert.doesNotMatch(source, /import Link from "next\/link"/);
});

// 与顶栏下拉同源：悬停只做「临时展开」，点击做「锁定展开」。
// 若点击仍是盲反相，鼠标滑到触发器上展开后的第一次单击会立刻把它关掉。

test("悬停已展开时点击触发器不再反向收起", () => {
  assert.doesNotMatch(source, /setIsOpen\(\(current\) => !current\)/);
  assert.match(source, /handleTriggerClick/);
  assert.match(
    source,
    /current\.open && current\.pinned[\s\S]{0,40}\? \{ open: false, pinned: false \}/,
  );
});

test("指针移开后的延迟收起不带走点击锁定的菜单", () => {
  assert.match(source, /current\.open && !current\.pinned/);
  assert.doesNotMatch(source, /\},\s*150\)/, "收尾延迟走统一常量，不许裸写 150");
});

test("悬停展开与顶栏统一实现共用悬停能力判定", () => {
  assert.match(
    source,
    /import \{ hasHoverPointer, HOVER_MENU_CLOSE_DELAY_MS \} from "@\/lib\/hover-pointer"/,
  );
  assert.match(source, /if \(!hasHoverPointer\(\)\) return;/);
});
