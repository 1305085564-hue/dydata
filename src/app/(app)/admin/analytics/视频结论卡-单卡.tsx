"use client";

import { AlertCircle, ArrowUpRight, Clock, Sparkles, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 获取可信度文案 } from "./视频结论卡-计算";

function signalTone(confidence: "low" | "medium" | "high") {
  if (confidence === "high") return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
  if (confidence === "medium") return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
  return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
}

const shellClassName =
 "group relative overflow-hidden rounded-md bg-white shadow-sm p-6 transition-[background-color,color,border-color,box-shadow,transform] duration-150 hover:border-zinc-300 hover:shadow-sm hover:-translate-y-px active:translate-y-0";

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
      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-[18px] font-medium tracking-tight text-zinc-900">{card.title}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border px-2.5 py-0.5 text-[12px] font-medium",
              signalTone(card.confidence),
            )}
          >
            {获取可信度文案(card.confidence)}
          </Badge>
        </header>

        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex size-14 shrink-0 items-center justify-center rounded-md bg-zinc-50 text-[#D97757]">
              {card.insufficient ? (
                <AlertCircle className="size-6 stroke-[1.5]" />
              ) : card.eyebrow === "Publish Window" ? (
                <Clock className="size-6 stroke-[1.5]" />
              ) : (
                <Sparkles className="size-6 stroke-[1.5]" />
              )}
            </div>
            <div>
              <p className="text-[12px] tracking-[0.12em] text-zinc-500">关键信号</p>
              <p className="mt-0.5 text-[18px] font-medium tracking-tight text-zinc-900 tabular-nums">{card.summary}</p>
            </div>
          </div>

          {card.footnote ? (
            <p className="text-[13px] leading-[1.7] text-zinc-500">{card.footnote}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="space-y-1">
            <p className="text-[12px] tracking-[0.12em] text-zinc-500">{keyMetric?.label}</p>
            <p className="text-[18px] font-medium tracking-tight tabular-nums text-zinc-700">{keyMetric?.value}</p>
          </div>
          <div className="space-y-1 border-l border-zinc-200 pl-3">
            <p className="text-[12px] tracking-[0.12em] text-zinc-500">
              {secondaryMetrics[0]?.label}
            </p>
            <p
              className={cn(
                "text-[18px] font-medium tracking-tight tabular-nums",
                secondaryMetrics[0]?.value.startsWith("+") ? "text-[#DC2626]" : "text-zinc-700",
              )}
            >
              {secondaryMetrics[0]?.value}
            </p>
          </div>
        </div>

        {onClick ? (
          <div className="pt-4">
            <Button type="button" variant="outline" className="w-full" onClick={onClick}>
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
        "border-l-[2px] border-l-[#C9604D]",
        className,
      )}
    >
      <div className="relative flex h-full flex-col justify-between gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-[#C9604D]/10 px-2.5 py-1 text-[12px] font-normal tracking-[0.12em] text-[#C9604D]">
                {card.eyebrow}
              </span>
            </div>
            <h3 className="text-[18px] font-medium tracking-tight text-zinc-900">{card.title}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border px-2.5 py-0.5 text-[12px] font-medium",
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
                "relative flex size-14 shrink-0 items-center justify-center rounded-md",
                needsIntervention
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
              )}
            >
              {needsIntervention ? <ArrowUpRight className="size-6 stroke-[1.5]" /> : <AlertCircle className="size-6 stroke-[1.5]" />}
            </div>
            <div>
              <p className="text-[12px] tracking-[0.12em] text-zinc-500">干预信号</p>
              <p className="mt-0.5 text-[18px] font-medium tracking-tight text-zinc-900 tabular-nums">{card.summary}</p>
            </div>
          </div>

          {card.footnote ? (
            <p className="text-[13px] leading-[1.7] text-zinc-500">{card.footnote}</p>
          ) : null}
        </div>

        {needsIntervention ? (
          <div className="pt-4">
            <p className="mb-3 text-[12px] tracking-[0.12em] text-zinc-500">重点人员</p>
            <div className="space-y-2">
              {card.items.slice(0, 2).map((item) => (
                <button
                  key={item.accountId}
                  type="button"
                  onClick={() => onItemClick?.(item.ownerName)}
                  className="group/item flex w-full items-center justify-between rounded-md bg-white shadow-sm p-3 text-left transition-[background-color,border-color] duration-150 hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-[#C9604D]/10 text-[#C9604D]">
                      <TrendingDown className="size-4 stroke-[1.5]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-zinc-900">{item.accountName}</p>
                      <p className="text-[12px] text-zinc-500">{item.ownerName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-medium tracking-tight tabular-nums text-[#16A34A]">
                      {item.dropRatio !== null ? `-${Math.round(item.dropRatio * 100)}%` : "—"}
                    </p>
                    <p className="mt-1 text-[12px] text-zinc-500">查看样本</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 pt-4">
            {card.metrics.map((metric) => (
              <div key={metric.label} className="space-y-1">
                <p className="text-[12px] tracking-[0.12em] text-zinc-500">{metric.label}</p>
                <p className="text-[18px] font-medium tracking-tight tabular-nums text-zinc-700">{metric.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
/* [规范对齐] 涨红跌绿已统一 */
/* [规范对齐] 卡片边框已处理 */
/* [规范对齐] 圆角已调整：卡片/面板 6px */
