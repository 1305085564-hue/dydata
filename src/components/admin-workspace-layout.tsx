import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AdminWorkspaceIndexItem {
  id: string;
  label: string;
  hint?: string;
}

interface AdminWorkspaceIndexGroup {
  label: string;
  items: AdminWorkspaceIndexItem[];
}

export type AdminWorkspaceLayoutWidth = "wide" | "extra-wide" | "full";

interface AdminWorkspaceLayoutProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  indexItems?: (AdminWorkspaceIndexItem | AdminWorkspaceIndexGroup)[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: AdminWorkspaceLayoutWidth;
}

const widthMap: Record<AdminWorkspaceLayoutWidth, string> = {
  wide: "mx-auto w-full max-w-7xl",
  "extra-wide": "mx-auto w-full max-w-screen-2xl",
  full: "mx-auto w-full max-w-none",
};

export function AdminWorkspaceLayout({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  width = "wide",
}: AdminWorkspaceLayoutProps) {
  const hasHeader = eyebrow || title || description || actions;

  return (
    <div className={cn("min-w-0 space-y-4 antialiased", widthMap[width], className)}>
      {hasHeader ? (
        <header className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between border-b border-[#ECE7DE]/80 pb-3 sm:pb-3.5">
          <div className="space-y-1">
            {eyebrow ? (
              <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#78716C]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h1
                className={cn(
                  "font-serif text-xl sm:text-2xl font-semibold tracking-tight text-[#1C1917]",
                  eyebrow && "mt-0.5",
                )}
              >
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className="max-w-3xl text-[12.5px] leading-[1.65] text-[#78716C]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
          ) : null}
        </header>
      ) : null}

      {children}
    </div>
  );
}

