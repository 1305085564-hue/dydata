"use client";

import type { ReactNode } from "react";

interface DashboardAnimatedSectionProps {
  className?: string;
  children: ReactNode;
  index: number;
}

export function DashboardAnimatedSection({ children, index , className }: DashboardAnimatedSectionProps) {
  return (
    <div
      className={className}
      style={{
        opacity: 1,
        transform: "translateY(0)",
        transitionDelay: `${Math.min(index * 40, 160)}ms`,
      }}
    >
      {children}
    </div>
  );
}
