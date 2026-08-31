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
  indexItems: (AdminWorkspaceIndexItem | AdminWorkspaceIndexGroup)[];
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
  indexItems,
  actions,
  children,
  className,
  width = "wide",
}: AdminWorkspaceLayoutProps) {
  const hasHeader = eyebrow || title || description || actions;

  return (
    <div className={cn("min-w-0 space-y-6 sm:space-y-10", widthMap[width], className)}>
      {hasHeader ? (
        <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between pb-1">
          <div>
            {eyebrow ? <p className="text-[11.5px] sm:text-[12px] font-medium uppercase tracking-[0.25em] text-[#78716C]">{eyebrow}</p> : null}
            {title ? <h1 className={cn("font-serif text-xl sm:text-2xl font-[580] tracking-tight sm:tracking-tighter text-[#1C1917]", eyebrow && "mt-1.5 sm:mt-2")}>{title}</h1> : null}
            {description ? <p className="mt-1.5 sm:mt-2 max-w-3xl text-[12.5px] sm:text-[13px] leading-[1.7] text-[#78716C]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      {children}
    </div>
  );
}
