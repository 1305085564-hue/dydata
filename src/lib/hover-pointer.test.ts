import assert from "node:assert/strict";
import test from "node:test";
import { hasHoverPointer, HOVER_MENU_CLOSE_DELAY_MS } from "./hover-pointer";

test("服务端渲染阶段视为无悬停能力，不误判成可悬停", () => {
  assert.equal(typeof window, "undefined", "该用例的前提是 Node 环境没有 window");
  assert.equal(hasHoverPointer(), false);
});

test("悬停弹层的收尾延迟在顶栏各弹层之间保持一致", () => {
  assert.equal(HOVER_MENU_CLOSE_DELAY_MS, 150);
});
