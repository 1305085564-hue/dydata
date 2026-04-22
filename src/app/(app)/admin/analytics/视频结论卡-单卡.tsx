"use client";

import { AlertCircle, ArrowUpRight, Clock, Sparkles, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 获取可信度文案 } from "./视频结论卡-计算";

function signalTone(confidence: "low" | "medium" | "high") {
  if (confidence === "high") return "border-emerald-200/85 bg-emerald-50/90 text-emerald-700 shadow-sm";
  if (confidence === "medium") return "border-amber-200/85 bg-amber-50/90 text-amber-700 shadow-sm";
  return "border-rose-200/85 bg-rose-50/90 text-rose-700 shadow-sm";
}

const shellClassName =
  "group relative overflow-hidden rounded-3xl border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.9)_0%,rgba(248,250,252,0.85)_100%)] p-6 shadow-[var(--shadow-card)] backdrop-blur-[24px] transition-all duration-500 hover:-translate-y-1 hover:border-white/80 hover:shadow-[var(--shadow-elevated)]";

export function 视频结论卡单卡({
  card,
  className,
  actionLabel,
  onClick,
}: {
  card: {
    title: string;
    eyebrow: string;
    summary: string;
    confidence: "low" | "medium" | "high";
    insufficient: boolean;
    metrics: Array<{ label: string; value: string }>;
    footnote?: string;
  };
  className?: string;
  actionLabel?: string;
  onClick?: () => void;
}) {
  const keyMetric = card.metrics[0];
  const secondaryMetrics = card.metrics.slice(1);

  return (
    <div className={cn(shellClassName, className)}>
      <div className="absolute -right-12 -top-12 size-48 rounded-full bg-[linear-gradient(225deg,var(--color-primary-light)_0%,transparent_70%)] opacity-[0.08] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.15]" />

      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">{card.title}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium backdrop-blur-md",
              signalTone(card.confidence),
            )}
          >
            {获取可信度文案(card.confidence)}
          </Badge>
        </header>

        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-light,var(--color-primary))_100%)] shadow-md">
              {card.insufficient ? (
                <AlertCircle className="size-6 text-white" />
              ) : card.eyebrow === "Publish Window" ? (
                <Clock className="size-6 text-white" />
              ) : (
                <Sparkles className="size-6 text-white" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-tertiary)]">关键信号</p>
              <p className="mt-0.5 text-2xl font-black tracking-tight text-[var(--color-text-primary)]">{card.summary}</p>
            </div>
          </div>

          {card.footnote ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">{card.footnote}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-200/60 pt-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">{keyMetric?.label}</p>
            <p className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">{keyMetric?.value}</p>
          </div>
          <div className="space-y-1 border-l border-slate-200/60 pl-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
              {secondaryMetrics[0]?.label}
            </p>
            <p
              className={cn(
                "text-lg font-bold tracking-tight",
                secondaryMetrics[0]?.value.startsWith("+") ? "text-emerald-600" : "text-[var(--color-text-primary)]",
              )}
            >
              {secondaryMetrics[0]?.value}
            </p>
          </div>
        </div>

        {onClick ? (
          <div className="border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" className="w-full rounded-2xl" onClick={onClick}>
              {actionLabel ?? "查看对应分析"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function 干预结论单卡({
  card,
  className,
  onItemClick,
}: {
  card: {
    title: string;
    eyebrow: string;
    summary: string;
    confidence: "low" | "medium" | "high";
    footnote?: string;
    metrics: Array<{ label: string; value: string }>;
    items: Array<{
      accountId: string;
      accountName: string;
      ownerName: string;
      dropRatio: number | null;
    }>;
  };
  className?: string;
  onItemClick?: (ownerName: string) => void;
}) {
  const needsIntervention = card.items.length > 0;

  return (
    <div
      className={cn(
        shellClassName,
        "bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(254,242,242,0.4)_100%)]",
        className,
      )}
    >
      <div className="absolute -left-12 -top-12 size-48 rounded-full bg-rose-500 opacity-[0.04] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.08]" />

      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">{card.title}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium backdrop-blur-md",
              signalTone(card.confidence),
            )}
          >
            {获取可信度文案(card.confidence)}
          </Badge>
        </header>

        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "relative flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-md",
                needsIntervention
                  ? "bg-[linear-gradient(135deg,var(--color-rose-500,#f43f5e)_0%,var(--color-rose-700,#be123c)_100%)]"
                  : "bg-[linear-gradient(135deg,var(--color-emerald-500,#10b981)_0%,var(--color-emerald-700,#047857)_100%)]",
              )}
            >
              {needsIntervention ? <ArrowUpRight className="size-6 text-white" /> : <AlertCircle className="size-6 text-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-tertiary)]">干预信号</p>
              <p className="mt-0.5 text-2xl font-black tracking-tight text-[var(--color-text-primary)]">{card.summary}</p>
            </div>
          </div>

          {card.footnote ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">{card.footnote}</p>
          ) : null}
        </div>

        {needsIntervention ? (
          <div className="border-t border-rose-100 pt-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">重点人员</p>
            <div className="space-y-2">
              {card.items.slice(0, 2).map((item) => (
                <button
                  key={item.accountId}
                  type="button"
                  onClick={() => onItemClick?.(item.ownerName)}
                  className="group/item flex w-full items-center justify-between rounded-xl border border-white/80 bg-white/60 p-3 text-left shadow-sm transition-colors hover:bg-white/90"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <TrendingDown className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">{item.accountName}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{item.ownerName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tracking-tight text-rose-600">
                      {item.dropRatio !== null ? `-${Math.round(item.dropRatio * 100)}%` : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">查看样本</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 border-t border-slate-200/60 pt-4">
            {card.metrics.map((metric) => (
              <div key={metric.label} className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">{metric.label}</p>
                <p className="text-base font-bold tracking-tight text-[var(--color-text-primary)]">{metric.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
