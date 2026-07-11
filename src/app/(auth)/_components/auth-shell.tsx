"use client";

import type { ReactNode } from "react";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow = "DYData", title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-stone-200 bg-white px-8 py-10">
        <div className="absolute right-6 top-6 opacity-80">
          <div
            className="h-[6px] w-[6px] rounded-full bg-[#D97757] motion-safe:animate-pulse"
            style={{ boxShadow: "0 0 16px 3px rgba(217, 119, 87, 0.55)" }}
          />
        </div>

        <div className="mb-10 space-y-3 text-center">
          <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500">
            {eyebrow}
          </p>
          <h1 className="text-[24px] font-medium tracking-tight text-stone-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-[13px] leading-[1.7] text-stone-500">{subtitle}</p>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
}
