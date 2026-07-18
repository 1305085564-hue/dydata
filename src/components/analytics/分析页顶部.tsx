"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import { cn } from "@/lib/utils";

interface AnalyticsPageHeaderProps {
  preset: AnalyticsRangePreset;
  from: string;
  to: string;
  onChange: (nextPreset: AnalyticsRangePreset, overrides?: { from?: string; to?: string }) => void;
}

const presetOptions: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "本月", value: "month" },
  { label: "自定义", value: "custom" },
];

export function AnalyticsPageHeader({ preset, from, to, onChange }: AnalyticsPageHeaderProps) {
  const [isExporting, setIsExporting] = useState(false);

  function getExportHref() {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return `/api/export?${params.toString()}`;
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(getExportHref());
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "导出失败" }));
        if (err.error === "数据量过大" && err.message) {
          feedbackToast.error(err.message);
        } else {
          feedbackToast.error(err.error || "导出失败");
        }
        return;
      }

      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `抖音数据日报_${from}_至_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      feedbackToast.success("导出成功");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[13px] font-medium tracking-tight text-stone-900">经营分析总览</h2>
        <span className="text-[12px] tabular-nums text-stone-500">
          {from} 至 {to}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {presetOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={preset === option.value ? "default" : "outline"}
                className={cn(
                  "h-7 rounded-lg px-3 text-[12px]",
                  preset === option.value
                    ? "border-transparent bg-[#B4532F] text-white hover:bg-[#A84D2B]"
                    : "border-stone-200 bg-white text-stone-700",
                )}
                onClick={() => onChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(event) => onChange("custom", { from: event.target.value, to })}
                className="h-8 w-[140px] border-stone-200 bg-white text-[12px]"
              />
              <span className="text-[12px] text-stone-500">→</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => onChange("custom", { from, to: event.target.value })}
                className="h-8 w-[140px] border-stone-200 bg-white text-[12px]"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#B4532F] px-3 text-[12px] font-medium text-white transition-[background-color] duration-150 hover:bg-[#A84D2B] active:translate-y-0"
          >
            <Download className="size-3.5 stroke-[1.5]" />
            {isExporting ? "导出中..." : "导出"}
          </button>
        </div>
      </div>
    </section>
  );
}
