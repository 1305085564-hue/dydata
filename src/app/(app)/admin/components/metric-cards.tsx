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
    primary: "text-[#D97757] bg-zinc-50 border-zinc-200",
    warning: "text-[#D99E55] bg-zinc-50 border-zinc-200",
    success: "text-[#6FAA7D] bg-zinc-50 border-zinc-200",
    danger: "text-[#C9604D] bg-zinc-50 border-zinc-200",
    neutral: "text-zinc-500 bg-zinc-50 border-zinc-200",
  };

  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isClickable && "cursor-pointer hover:-translate-y-[1px] active:translate-y-0 hover:shadow-sm hover:border-zinc-300 group"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tracking-tight text-zinc-800 font-mono tabular-nums">{value}</span>
            {trend && (
              <span className={cn(
                "text-[12px] font-medium px-1.5 py-0.5 rounded-[10px]",
                trend.isPositive ? "text-[#6FAA7D] bg-[#6FAA7D]/10" : "text-[#C9604D] bg-[#C9604D]/10"
              )}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-[1.7] text-zinc-400">{hint}</p>
        </div>
        <div className={cn("rounded-lg p-2.5 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]", toneClasses[tone])}>
          <Icon className="size-5 stroke-[1.5]" />
        </div>
      </div>
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
