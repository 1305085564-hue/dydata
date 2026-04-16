"use client";

import { AlertCircle, ArrowUpRight, Sparkles, TrendingDown, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 获取可信度文案 } from "./视频结论卡-计算";
import type { 干预结论卡数据, 结论卡数据 } from "./视频结论卡-类型";

function 信号色(confidence: 结论卡数据["confidence"]) {
  if (confidence === "high") return "border-emerald-200/85 bg-emerald-50/90 text-emerald-700 shadow-sm";
  if (confidence === "medium") return "border-amber-200/85 bg-amber-50/90 text-amber-700 shadow-sm";
  return "border-rose-200/85 bg-rose-50/90 text-rose-700 shadow-sm";
}

const 卡片外壳样式 =
  "group relative overflow-hidden rounded-3xl border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.9)_0%,rgba(248,250,252,0.85)_100%)] p-6 shadow-[var(--shadow-card)] backdrop-blur-[24px] transition-all duration-500 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1 hover:border-white/80";

export function 视频结论单卡({ card, className }: { card: 结论卡数据; className?: string }) {
  // Extract key metric for display
  const keyMetric = card.metrics[0];
  const secondaryMetrics = card.metrics.slice(1);

  return (
    <div className={cn(卡片外壳样式, className)}>
      <div className="absolute -right-12 -top-12 size-48 rounded-full bg-[linear-gradient(225deg,var(--color-primary-light)_0%,transparent_70%)] opacity-[0.08] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.15]" />
      
      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] text-[var(--color-primary)] uppercase">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              {card.title}
            </h3>
          </div>
          <Badge variant="outline" className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium backdrop-blur-md", 信号色(card.confidence))}>
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
              <p className="text-sm font-medium text-[var(--color-text-tertiary)]">关键洞察</p>
              <p className="mt-0.5 text-2xl font-black tracking-tight text-[var(--color-text-primary)]">
                {card.summary}
              </p>
            </div>
          </div>
          
          {card.footnote && (
             <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
               {card.footnote}
             </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200/60">
          <div className="space-y-1">
             <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">{keyMetric?.label}</p>
             <p className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">{keyMetric?.value}</p>
          </div>
          <div className="space-y-1 pl-3 border-l border-slate-200/60">
             <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">{secondaryMetrics[0]?.label}</p>
             <p className={cn(
               "text-lg font-bold tracking-tight", 
               secondaryMetrics[0]?.value.startsWith("+") ? "text-emerald-600" : "text-[var(--color-text-primary)]"
             )}>
               {secondaryMetrics[0]?.value}
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function 干预结论单卡({ card, className }: { card: 干预结论卡数据; className?: string }) {
  const needsIntervention = card.items.length > 0;
  
  return (
    <div className={cn(卡片外壳样式, "bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(254,242,242,0.4)_100%)]", className)}>
      <div className="absolute -left-12 -top-12 size-48 rounded-full bg-rose-500 opacity-[0.04] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.08]" />
      
      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
             <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] text-rose-600 uppercase">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              {card.title}
            </h3>
          </div>
          <Badge variant="outline" className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium backdrop-blur-md", 信号色(card.confidence))}>
            {获取可信度文案(card.confidence)}
          </Badge>
        </header>

        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "relative flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-md",
              needsIntervention ? "bg-[linear-gradient(135deg,var(--color-rose-500,#f43f5e)_0%,var(--color-rose-700,#be123c)_100%)]" : "bg-[linear-gradient(135deg,var(--color-emerald-500,#10b981)_0%,var(--color-emerald-700,#047857)_100%)]"
            )}>
              {needsIntervention ? (
                <ArrowUpRight className="size-6 text-white" />
              ) : (
                <AlertCircle className="size-6 text-white" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-tertiary)]">干预信号</p>
              <p className="mt-0.5 text-2xl font-black tracking-tight text-[var(--color-text-primary)]">
                {card.summary}
              </p>
            </div>
          </div>
          
          {card.footnote && (
             <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
               {card.footnote}
             </p>
          )}
        </div>

        {needsIntervention ? (
          <div className="pt-4 border-t border-rose-100">
            <p className="mb-3 text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">重点人员</p>
            <div className="space-y-2">
              {card.items.slice(0, 2).map((item) => (
                <div key={item.accountId} className="group/item flex items-center justify-between rounded-xl border border-white/80 bg-white/60 p-3 shadow-sm transition-colors hover:bg-white/90">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200/60">
            {card.metrics.map((metric) => (
              <div key={metric.label} className="space-y-1">
                 <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">{metric.label}</p>
                 <p className="text-base font-bold tracking-tight text-[var(--color-text-primary)]">{metric.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
