"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow = "DYData", title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl bg-white px-8 py-10"
      >
        <div className="absolute left-0 right-0 top-0 h-[2px] bg-[#D97757]" />

        <div className="mb-10 space-y-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            {eyebrow}
          </p>
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-800">
            {title}
          </h1>
          <p className="text-[13px] leading-[1.7] text-zinc-500">{subtitle}</p>
        </div>

        {children}
      </motion.div>
    </div>
  );
}
