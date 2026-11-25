export interface SelectableInputLike {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  select: () => void;
}

/**
 * 鼠标点进未聚焦的数值格时保住全选（浏览器会在 focus 之后触发 mouseup 并清掉选区）；
 * 若输入格已处于聚焦态（含 Tab / 报错自动聚焦送进来的情况），再点击只落光标，不再强行全选。
 */
export function createClickSelectAllController() {
  let pointerFocusing = false;
  let selectOnMouseUp = false;

  return {
    handleMouseDown(isAlreadyFocused: boolean) {
      pointerFocusing = !isAlreadyFocused;
      selectOnMouseUp = false;
    },
    handleFocus(input: SelectableInputLike) {
      selectOnMouseUp = pointerFocusing;
      pointerFocusing = false;
      input.select();
    },
    handleMouseUp(input: SelectableInputLike) {
      if (!selectOnMouseUp) return;
      selectOnMouseUp = false;
      if (input.selectionStart === input.selectionEnd && input.value.length > 0) {
        input.select();
      }
    },
    handleBlur() {
      pointerFocusing = false;
      selectOnMouseUp = false;
    },
  };
}
