import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type AppShellWidth = "normal" | "wide"

export interface AppShellProps {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  width?: AppShellWidth
}

export interface AppShellHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}

const widthMap: Record<AppShellWidth, string> = {
  normal: "mx-auto w-full max-w-5xl",
  wide: "mx-auto w-full max-w-7xl",
}

function ShellHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: AppShellHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between pb-1", className)}>
      <div>
        {eyebrow ? <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-[#78716C]">{eyebrow}</p> : null}
        {title ? <h1 className={cn("font-serif text-[20px] sm:text-[28px] leading-[1.20] font-medium tracking-tight text-[#141413]", eyebrow && "mt-1.5 sm:mt-2")}>{title}</h1> : null}
        {description ? <p className="mt-1.5 sm:mt-2 max-w-3xl text-[13px] leading-[1.7] text-[#1F1E1D]">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        {meta ? <div className="max-w-full">{meta}</div> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

export function AppShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  width = "wide",
}: AppShellProps) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <div className={cn("app-shell-frame min-w-0 min-h-screen min-h-dvh space-y-6 sm:space-y-10", widthMap[width], className)}>
      {hasHeader ? (
        <ShellHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      ) : null}
      {children}
    </div>
  )
}

