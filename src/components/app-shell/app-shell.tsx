import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type AppShellTone = "neutral" | "primary" | "success" | "warning" | "danger"

export type AppShellWidth = "normal" | "wide" | "full"

export interface AppShellProps {
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

export interface AppShellHeroProps extends AppShellHeaderProps {
  children?: ReactNode
  className?: string
  bodyClassName?: string
}

export interface AppShellSectionProps extends AppShellHeaderProps {
  children?: ReactNode
  className?: string
  bodyClassName?: string
  divider?: boolean
}

export interface AppShellMetricItem {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: AppShellTone
}

export interface AppShellMetricStripProps {
  items: AppShellMetricItem[]
  className?: string
  columns?: 2 | 3 | 4 | 5
}

const widthMap: Record<AppShellWidth, string> = {
  normal: "mx-auto w-full max-w-5xl",
  wide: "mx-auto w-full max-w-7xl",
  full: "mx-auto w-full max-w-none",
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
    <div className={cn("app-shell-header-row", className)}>
      <div className="space-y-2">
        {eyebrow ? <div className="app-shell-kicker">{eyebrow}</div> : null}
        <div className="space-y-2">
          <h1 className="app-shell-title app-shell-heading">{title}</h1>
          {description ? <p className="app-shell-subtitle">{description}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {meta ? <div className="max-w-full">{meta}</div> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

export function AppShell({ children, className, width = "wide" }: AppShellProps) {
  return <div className={cn("app-shell-frame min-h-screen space-y-5 sm:space-y-6", widthMap[width], className)}>{children}</div>
}

export function AppShellHero({ children, className, bodyClassName, ...props }: AppShellHeroProps) {
  return (
    <section className={cn("app-shell-hero overflow-hidden rounded-2xl border border-zinc-200 bg-white", className)}>
      <div className={cn("space-y-4 p-5 sm:p-6 lg:p-7", bodyClassName)}>
        <ShellHeader {...props} />
        {children ? <div className="space-y-4">{children}</div> : null}
      </div>
    </section>
  )
}

export function AppShellSection({ children, className, bodyClassName, divider = false, ...props }: AppShellSectionProps) {
  return (
    <section className={cn("app-shell-section overflow-hidden rounded-2xl border border-zinc-200 bg-white", className)}>
      <div className={cn("space-y-4 p-5 sm:p-6", bodyClassName)}>
        <ShellHeader {...props} />
        {divider ? <div className="app-shell-section-divider" aria-hidden /> : null}
        {children ? <div className="space-y-4">{children}</div> : null}
      </div>
    </section>
  )
}

export function AppShellMetricStrip({ items, className, columns = 4 }: AppShellMetricStripProps) {
  const safeColumns = Math.min(Math.max(columns, 2), 5) as 2 | 3 | 4 | 5

  return (
    <div className={cn("app-shell-metric-strip", className)} data-columns={safeColumns}>
      {items.map((item, index) => (
        <div key={index} className="app-shell-metric" data-tone={item.tone ?? "neutral"}>
          <div className="app-shell-metric-label">{item.label}</div>
          <div className="space-y-1">
            <div className="app-shell-metric-value">{item.value}</div>
            {item.hint ? <div className="app-shell-metric-hint">{item.hint}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function AppShellHeader(props: AppShellHeaderProps) {
  return <ShellHeader {...props} />
}

