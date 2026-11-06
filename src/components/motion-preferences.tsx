"use client";

import { MotionConfig } from "framer-motion";

/**
 * 让 framer-motion 驱动的动效也尊重系统「减弱动态效果」设置。
 * CSS 动效由 animations.css 的全局回退兜底；framer-motion 走 JS 内联样式，需要这一层。
 */
export function MotionPreferences({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
