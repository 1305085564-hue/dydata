"use client";

import { useEffect } from "react";
import { MotionConfig, MotionGlobalConfig } from "framer-motion";

/**
 * 让 framer-motion 驱动的动效也尊重系统「减弱动态效果」设置。
 * CSS 动效由 animations.css 的全局回退兜底；framer-motion 走 JS 内联样式，需要这一层。
 *
 * MotionConfig reducedMotion="user" 只关位移/缩放，透明度仍会渐变；
 * 所以再用 MotionGlobalConfig.skipAnimations 让所有 framer 动画瞬间到位，与 CSS 兜底一致。
 */
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

if (typeof window !== "undefined") {
  MotionGlobalConfig.skipAnimations = window.matchMedia(REDUCE_QUERY).matches;
}

export function MotionPreferences({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia(REDUCE_QUERY);
    const sync = () => {
      MotionGlobalConfig.skipAnimations = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
