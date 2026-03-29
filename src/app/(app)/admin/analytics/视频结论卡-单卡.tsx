"use client";

import { AlertCircle, ArrowUpRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 获取可信度文案 } from "./视频结论卡-计算";
import type { 干预结论卡数据, 结论卡数据 } from "./视频结论卡-类型";

function 信号色(confidence: 结论卡数据["confidence"]) {
  if (confidence === "high") return "border-emerald-200/85 bg-emerald-50/90 text-emerald-700";
  if (confidence === "medium") return "border-amber-200/85 bg-amber-50/90 text-amber-700";
  return "border-rose-200/85 bg-rose-50/90 text-rose-700";
}

const 卡片外壳样式 =
  "min-h-[244px] rounded-[18px] border border-white/75 bg-white/90 shadow-[var(--shadow-light)] backdrop-blur-[14px]";

export function 视频结论单卡({ card }: { card: 结论卡数据 }) {
  return (
    <Card className={卡片外壳样式}>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">{card.eyebrow}</p>
            <CardTitle className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">{card.title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("border text-[11px] font-medium", 信号色(card.confidence))}>
            {获取可信度文案(card.confidence)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-3">
        <div className="rounded-[14px] bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] p-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            {card.insufficient ? <AlertCircle className="size-4" /> : <Sparkles className="size-4" />}
            <span className="text-xs font-medium">核心结论</span>
          </div>
          <p className="mt-2 text-[18px] leading-tight font-semibold tracking-tight text-[var(--color-text-primary)] line-clamp-3 sm:text-[22px]">{card.summary}</p>
          {card.footnote ? <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)] line-clamp-2">{card.footnote}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {card.metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded-[12px] border border-slate-200/70 bg-slate-50/80 px-3 py-2.5"
            >
              <span className="text-xs text-[var(--color-text-secondary)]">{metric.label}</span>
              <span className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">{metric.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function 干预结论单卡({ card }: { card: 干预结论卡数据 }) {
  return (
    <Card className={卡片外壳样式}>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">{card.eyebrow}</p>
            <CardTitle className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">{card.title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("border text-[11px] font-medium", 信号色(card.confidence))}>
            {获取可信度文案(card.confidence)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-3">
        <div className="rounded-[14px] bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] p-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            {card.items.length > 0 ? <ArrowUpRight className="size-4" /> : <AlertCircle className="size-4" />}
            <span className="text-xs font-medium">干预信号</span>
          </div>
          <p className="mt-2 text-[18px] leading-tight font-semibold tracking-tight text-[var(--color-text-primary)] line-clamp-3 sm:text-[22px]">{card.summary}</p>
          {card.footnote ? <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)] line-clamp-2">{card.footnote}</p> : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {card.metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] text-[var(--color-text-secondary)]">{metric.label}</p>
              <p className="mt-1 text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">{metric.value}</p>
            </div>
          ))}
        </div>

        {card.items.length > 0 ? (
          <div className="space-y-3">
            {card.items.map((item) => (
              <div key={item.accountId} className="rounded-[12px] border border-slate-200/70 bg-white/70 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">{item.accountName}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">负责人 · {item.ownerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--color-text-tertiary)]">下滑幅度</p>
                    <p className="text-sm font-semibold tracking-tight text-rose-600">
                      {item.dropRatio !== null ? `${Math.round(item.dropRatio * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.triggerReasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
