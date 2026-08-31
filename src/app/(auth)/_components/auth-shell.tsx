"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow = "DYData", title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12 bg-[#FBF9F5]">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.215, 0.610, 0.355, 1.000] }}
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl bg-white px-8 py-9 shadow-card-ring"
      >
        {/* 顶部静谧陶土微徽印（遵循系统减少动效偏好） */}
        <div className="absolute right-7 top-7 flex items-center justify-center size-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#D97757]/20 motion-safe:animate-ping opacity-75" />
          <div className="relative h-1.5 w-1.5 rounded-full bg-[#D97757]" />
        </div>

        {/* 案头手稿线描插图 */}
        <div className="flex justify-center -mt-2 -mb-2">
          <DeskStudyIllustration size={96} />
        </div>

        <div className="mb-8 space-y-2 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
            {eyebrow}
          </p>
          <h1 className="font-serif text-2xl font-[580] tracking-tight text-[#1C1917]">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-[13px] leading-[1.7] text-[#78716C]">{subtitle}</p>
          ) : null}
        </div>

        {children}
      </motion.div>
    </div>
  );
}
