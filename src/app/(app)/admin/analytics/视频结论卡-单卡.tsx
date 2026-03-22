"use client";

import { AlertCircle, ArrowUpRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 获取可信度文案 } from "./视频结论卡-计算";
import type { 干预结论卡数据, 结论卡数据 } from "./视频结论卡-类型";

function 信号色(confidence: 结论卡数据["confidence"]) {
  if (confidence === "high") return "text-emerald-700 bg-emerald-50 border-emerald-200/80";
  if (confidence === "medium") return "text-amber-700 bg-amber-50 border-amber-200/80";
  return "text-rose-700 bg-rose-50 border-rose-200/80";
}

export function 视频结论单卡({ card }: { card: 结论卡数据 }) {
  return (
    <Card className="min-h-[244px] rounded-[16px] border border-white/70 bg-white/88 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">{card.eyebrow}</p>
            <CardTitle className="text-[15px] font-semibold tracking-tight text-slate-900">{card.title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("border text-[11px] font-medium", 信号色(card.confidence))}>
            {获取可信度文案(card.confidence)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-4">
        <div className="rounded-[14px] bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] p-4 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-slate-500">
            {card.insufficient ? <AlertCircle className="size-4" /> : <Sparkles className="size-4" />}
            <span className="text-xs font-medium">核心结论</span>
          </div>
          <p className="mt-3 text-[22px] leading-tight font-semibold tracking-tight text-slate-950 line-clamp-3">{card.summary}</p>
          {card.footnote ? <p className="mt-2 text-xs leading-5 text-slate-500 line-clamp-2">{card.footnote}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {card.metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded-[12px] border border-slate-200/70 bg-slate-50/80 px-3 py-2.5"
            >
              <span className="text-xs text-slate-500">{metric.label}</span>
              <span className="text-sm font-semibold tracking-tight text-slate-900">{metric.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function 干预结论单卡({ card }: { card: 干预结论卡数据 }) {
  return (
    <Card className="min-h-[244px] rounded-[16px] border border-white/70 bg-white/88 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">{card.eyebrow}</p>
            <CardTitle className="text-[15px] font-semibold tracking-tight text-slate-900">{card.title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("border text-[11px] font-medium", 信号色(card.confidence))}>
            {获取可信度文案(card.confidence)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-4">
        <div className="rounded-[14px] bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] p-4 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-slate-500">
            {card.items.length > 0 ? <ArrowUpRight className="size-4" /> : <AlertCircle className="size-4" />}
            <span className="text-xs font-medium">干预信号</span>
          </div>
          <p className="mt-3 text-[22px] leading-tight font-semibold tracking-tight text-slate-950 line-clamp-3">{card.summary}</p>
          {card.footnote ? <p className="mt-2 text-xs leading-5 text-slate-500 line-clamp-2">{card.footnote}</p> : null}
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {card.metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] text-slate-500">{metric.label}</p>
              <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">{metric.value}</p>
            </div>
          ))}
        </div>

        {card.items.length > 0 ? (
          <div className="space-y-2.5">
            {card.items.map((item) => (
              <div key={item.accountId} className="rounded-[12px] border border-slate-200/70 bg-white/70 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-slate-900">{item.accountName}</p>
                    <p className="text-xs text-slate-500">负责人 · {item.ownerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">下滑幅度</p>
                    <p className="text-sm font-semibold tracking-tight text-rose-600">
                      {item.dropRatio !== null ? `${Math.round(item.dropRatio * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.triggerReasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
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
