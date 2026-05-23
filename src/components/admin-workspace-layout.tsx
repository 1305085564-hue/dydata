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

interface AdminWorkspaceLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  indexItems: (AdminWorkspaceIndexItem | AdminWorkspaceIndexGroup)[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AdminWorkspaceLayout({
  eyebrow,
  title,
  description,
  indexItems,
  actions,
  children,
  className,
}: AdminWorkspaceLayoutProps) {
  return (
    <div className={cn("min-w-0 space-y-8", className)}>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">{eyebrow}</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-zinc-800">{title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.7] text-zinc-500">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {children}
    </div>
  );
}
