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
    primary: "text-[#B4532F] bg-stone-50 border-stone-200",
    warning: "text-[#8F641B] bg-stone-50 border-stone-200",
    success: "text-[#3F7A4E] bg-stone-50 border-stone-200",
    danger: "text-[#B24E3E] bg-stone-50 border-stone-200",
    neutral: "text-stone-500 bg-stone-50 border-stone-200",
  };

  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-stone-200 bg-white p-5 transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isClickable && "cursor-pointer hover:shadow-sm hover:border-stone-300 group"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.25em] font-normal text-stone-500">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[18px] font-medium tracking-tight text-stone-900 tabular-nums">{value}</span>
            {trend && (
              <span className={cn(
                "text-[12px] font-medium px-1.5 py-0.5 rounded-full",
                trend.isPositive ? "text-[#3F7A4E] bg-[#6FAA7D]/10" : "text-[#B24E3E] bg-[#C9604D]/10"
              )}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-[1.7] text-stone-500">{hint}</p>
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
