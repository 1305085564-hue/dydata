"use client";

import { Activity, Users, FileClock, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  Activity,
  Users,
  FileClock,
  ShieldCheck,
};

export interface MetricCardProps {
  label: string;
  value: number | string;
  hint: string;
  icon: string;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  onClick?: () => void;
  tone?: "primary" | "warning" | "success" | "neutral" | "danger";
}

export function MetricCard({ label, value, hint, icon, trend, onClick, tone = "neutral" }: MetricCardProps) {
  const Icon = iconMap[icon] ?? Activity;
  const toneClasses = {
    primary: "text-zinc-950 bg-zinc-100 border-zinc-200",
    warning: "text-amber-600 bg-amber-50 border-amber-200",
    success: "text-emerald-700 bg-emerald-50 border-emerald-200",
    danger: "text-red-700 bg-red-50 border-red-200",
    neutral: "text-zinc-500 bg-zinc-50 border-zinc-200",
  };

  const isClickable = !!onClick;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300",
        isClickable && "cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-zinc-300 group"
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
        <div className={cn("rounded-xl p-2.5 transition-colors", toneClasses[tone], isClickable && "group-hover:bg-zinc-950 group-hover:text-white")}>
          <Icon className="size-5" />
        </div>
      </div>
      
      {/* 底部微型火花线占位符 - 由于不引入新库，用 CSS 渐变模拟 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950/10 opacity-0 group-hover:opacity-100 transition-opacity" />
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
