/** 悬停类弹层的统一收尾延迟：指针真正离开后多久收起。 */
export const HOVER_MENU_CLOSE_DELAY_MS = 150;

/**
 * 触屏设备上 mouseenter / mouseleave 由点击合成，若照常执行悬停逻辑，
 * 「滑入即展开」和「点击」会同时命中，表现为点一下闪开又消失。
 * 因此只在具备真实悬停能力的设备上启用悬停展开。
 */
export function hasHoverPointer() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover)").matches;
}
