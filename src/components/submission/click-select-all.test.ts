import assert from "node:assert/strict";
import test from "node:test";
import { createClickSelectAllController, type SelectableInputLike } from "./click-select-all";

function createFakeInput(value: string): SelectableInputLike & { selectCount: number } {
  const state = {
    value,
    selectionStart: 0 as number | null,
    selectionEnd: 0 as number | null,
    selectCount: 0,
    select() {
      this.selectCount += 1;
      this.selectionStart = 0;
      this.selectionEnd = this.value.length;
    },
  };
  return state;
}

test("鼠标点进未聚焦的存疑数字格时，松手后仍保住全选方便直接覆写", () => {
  const ctrl = createClickSelectAllController();
  const input = createFakeInput("1280");

  ctrl.handleMouseDown(false);
  ctrl.handleFocus(input);
  assert.equal(input.selectCount, 1);

  // 模拟浏览器在 mouseup 时默认把光标折叠到点击点
  input.selectionStart = 2;
  input.selectionEnd = 2;
  ctrl.handleMouseUp(input);

  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 4);
  assert.equal(input.selectCount, 2);
});

test("Tab 或报错自动把光标送进格子后，再点格内插入光标不会被强行全选吃掉", () => {
  const ctrl = createClickSelectAllController();
  const input = createFakeInput("1280");

  // 键盘 Tab 或报错送焦：直接 focus，未经过 mousedown
  ctrl.handleFocus(input);
  assert.equal(input.selectCount, 1);

  // 用户再点一下想把光标放在第 2 位后面改单个数字
  ctrl.handleMouseDown(true);
  input.selectionStart = 2;
  input.selectionEnd = 2;
  ctrl.handleMouseUp(input);

  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 2);
  assert.equal(input.selectCount, 1);
});

test("鼠标点进未聚焦格子并拖选部分数字时，保留用户的拖选区间", () => {
  const ctrl = createClickSelectAllController();
  const input = createFakeInput("1280");

  ctrl.handleMouseDown(false);
  ctrl.handleFocus(input);

  // 拖选了中间的 "28"
  input.selectionStart = 1;
  input.selectionEnd = 3;
  ctrl.handleMouseUp(input);

  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 3);
  assert.equal(input.selectCount, 1);
});
