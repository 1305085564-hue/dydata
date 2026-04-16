"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  onClick?: () => void;
  tone?: "primary" | "warning" | "success" | "neutral" | "danger";
}

export function MetricCard({ label, value, hint, icon: Icon, trend, onClick, tone = "neutral" }: MetricCardProps) {
  const toneClasses = {
    primary: "text-[var(--color-primary)] bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20",
    warning: "text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20",
    success: "text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20",
    danger: "text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20",
    neutral: "text-[var(--color-text-secondary)] bg-[var(--color-surface)]/40 border-[var(--color-border)]/50",
  };

  const isClickable = !!onClick;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--shadow-card)] transition-all duration-300",
        isClickable && "cursor-pointer hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--color-primary)]/30 group"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">{value}</span>
            {trend && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded-full",
                trend.isPositive ? "text-[var(--color-success)] bg-[var(--color-success)]/10" : "text-[var(--color-danger)] bg-[var(--color-danger)]/10"
              )}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{hint}</p>
        </div>
        <div className={cn("rounded-xl p-2.5 transition-colors", toneClasses[tone], isClickable && "group-hover:bg-[var(--color-primary)] group-hover:text-white")}>
          <Icon className="size-5" />
        </div>
      </div>
      
      {/* 底部微型火花线占位符 - 由于不引入新库，用 CSS 渐变模拟 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--color-primary)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

interface MetricCardsRowProps {
  cards: MetricCardProps[];
}

export function MetricCardsRow({ cards }: MetricCardsRowProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <MetricCard key={index} {...card} />
      ))}
    </div>
  );
}
