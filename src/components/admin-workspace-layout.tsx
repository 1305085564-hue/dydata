import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminWorkspaceLayoutWidth = "normal" | "wide";

interface AdminWorkspaceLayoutProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: AdminWorkspaceLayoutWidth;
  hideHeaderOnMobile?: boolean;
}

const widthMap: Record<AdminWorkspaceLayoutWidth, string> = {
  normal: "mx-auto w-full max-w-5xl",
  wide: "mx-auto w-full max-w-7xl",
};

export function AdminWorkspaceLayout({
  title,
  description,
  actions,
  children,
  className,
  width = "wide",
  hideHeaderOnMobile = false,
}: AdminWorkspaceLayoutProps) {
  const hasHeader = title || description || actions;

  return (
    <div className={cn("min-w-0 space-y-5", widthMap[width], className)}>
      {hasHeader ? (
        <header className={cn("flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between", hideHeaderOnMobile && "hidden md:flex")}>
          <div className="space-y-1">
            {title ? <h1 className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413]">{title}</h1> : null}
            {description ? <p className="max-w-3xl text-[14px] leading-[1.60] text-[#1F1E1D]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pt-1">{actions}</div> : null}
        </header>
      ) : null}

      {children}
    </div>
  );
}
