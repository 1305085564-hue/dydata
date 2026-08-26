"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow = "DYData", title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.215, 0.610, 0.355, 1.000] }}
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white px-8 py-10 shadow-claude-float hover:shadow-claude-dialog hover:-translate-y-[2px] transition-all duration-150"
      >
        <div className="absolute right-7 top-7 opacity-80 flex items-center justify-center size-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#D97757]/20 motion-safe:animate-ping opacity-75" />
          <div
            className="relative h-[6px] w-[6px] rounded-full bg-[#D97757] motion-safe:animate-pulse"
            style={{ boxShadow: "0 0 16px 3px rgba(217, 119, 87, 0.6)" }}
          />
        </div>

        <div className="mb-10 space-y-3 text-center">
          <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-[#78716C]">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
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
