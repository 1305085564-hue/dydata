"use client";

import { useLayoutEffect, useState } from "react";

/**
 * 自写浮层的退场动画：关闭后多留 `durationMs` 再卸载，让收起动画走完。
 * 系统组件（components/ui 的 Dialog/Sheet/Popover/Dropdown/Select）已自带退场，不需要用这个。
 *
 * 做法参考 OpenMausBot（Apache-2.0）src/components/MenuMotion.tsx 的 useMenuMotion：
 * - 关闭的那一帧就标记 closing，浮层立即不可点（防止退场中被误点）；
 * - 用户开了「减弱动效」时直接卸载，不等动画。
 */
export const EXIT_MOTION_MS = 150;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface ExitMotion {
  /** 是否渲染浮层（打开中或正在退场） */
  shown: boolean;
  /** 正在退场 */
  closing: boolean;
  /** 挂到浮层根节点上的退场属性：退场期间不可交互、对读屏隐藏 */
  exitProps: { inert?: boolean; "aria-hidden"?: boolean };
}

export function useExitMotion(open: boolean, durationMs: number = EXIT_MOTION_MS): ExitMotion {
  const [mounted, setMounted] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, durationMs]);

  const closing = !open && mounted;
  return {
    shown: open || mounted,
    closing,
    exitProps: closing ? { inert: true, "aria-hidden": true } : {},
  };
}
