import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AdminWorkspaceIndexItem {
  id: string;
  label: string;
  hint?: string;
}

interface AdminWorkspaceLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  indexItems: AdminWorkspaceIndexItem[];
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
    <div className={cn("grid gap-8 lg:grid-cols-[minmax(0,1fr)_140px]", className)}>
      <div className="min-w-0 space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">{eyebrow}</p>
            <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">{title}</h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-[1.7] text-zinc-500">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        {children}
      </div>

      {indexItems.length > 0 ? (
        <aside className="hidden lg:block">
          <nav
            aria-label="页面索引"
            className="sticky top-8 border-l border-zinc-200 text-[12px]"
          >
            {indexItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-zinc-500 transition-[color,border-color] duration-150 hover:border-zinc-300 hover:text-zinc-800"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
      ) : null}
    </div>
  );
}
