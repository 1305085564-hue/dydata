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

export type AdminWorkspaceLayoutWidth = "wide" | "full";

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
    <div className={cn("min-w-0 space-y-6", widthMap[width], className)}>
      {hasHeader ? (
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {eyebrow ? <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-400">{eyebrow}</p> : null}
            {title ? <h1 className={cn("text-[24px] font-semibold tracking-tight text-stone-800", eyebrow && "mt-2")}>{title}</h1> : null}
            {description ? <p className="mt-1 max-w-3xl text-[13px] leading-[1.7] text-stone-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      {children}
    </div>
  );
}
