import type { MouseEvent } from "react";

/**
 * 判断点击是否应按当前页原地交互处理。
 * 当事件已被 defaultPrevented、用户按住 Ctrl / Cmd / Shift / Alt 或点击中键（button !== 0）时返回 false，
 * 交给浏览器原生 <a href> 后台/新开标签页，且不触发父行原地打开逻辑。
 */
export function shouldHandleInPlaceLinkClick(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & {
    defaultPrevented?: boolean;
  },
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
