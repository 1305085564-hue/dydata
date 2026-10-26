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

export type AdminWorkspaceLayoutWidth = "wide";

interface AdminWorkspaceLayoutProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  indexItems?: (AdminWorkspaceIndexItem | AdminWorkspaceIndexGroup)[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: AdminWorkspaceLayoutWidth;
  hideHeaderOnMobile?: boolean;
}

const widthMap: Record<AdminWorkspaceLayoutWidth, string> = {
  wide: "mx-auto w-full max-w-7xl",
};

export function AdminWorkspaceLayout({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  width = "wide",
  hideHeaderOnMobile = false,
}: AdminWorkspaceLayoutProps) {
  const hasHeader = eyebrow || title || description || actions;

  return (
    <div className={cn("min-w-0", hideHeaderOnMobile ? "space-y-2 sm:space-y-10" : "space-y-6 sm:space-y-10", widthMap[width], className)}>
      {hasHeader ? (
        <header className={cn("flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between pb-1", hideHeaderOnMobile && "hidden md:flex")}>
          <div>
            {eyebrow ? <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-[#78716C]">{eyebrow}</p> : null}
            {title ? <h1 className={cn("font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413]", eyebrow && "mt-1.5 sm:mt-2")}>{title}</h1> : null}
            {description ? <p className="mt-1.5 sm:mt-2 max-w-3xl text-[14px] leading-[1.7] text-[#1F1E1D]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
        </header>
      ) : null}

      {children}
    </div>
  );
}
