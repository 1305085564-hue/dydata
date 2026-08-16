"use client";

import { useState } from "react";
import { Download } from "lucide-react";
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
    <section className="py-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[14px] font-semibold tracking-tight text-zinc-950">经营分析总览</h2>
        <span className="text-[12px] tabular-nums text-zinc-600 font-normal">
          {from} 至 {to}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* 微气垫 Tab 时间预设切换 */}
          <div className="inline-flex items-center gap-1 bg-zinc-100/70 p-1 rounded-xl select-none">
            {presetOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  preset === option.value
                    ? "bg-white text-zinc-950 shadow-2xs font-medium"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* 结构呼吸微竖线 */}
          <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-0.5 shrink-0" aria-hidden="true" />

          {preset === "custom" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={from}
                onChange={(event) => onChange("custom", { from: event.target.value, to })}
                className="h-7 w-[130px] border-0 bg-zinc-100/70 hover:bg-zinc-100 focus:bg-white text-[12px] text-zinc-800 rounded-lg"
              />
              <span className="text-[12px] text-zinc-400 font-normal">→</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => onChange("custom", { from, to: event.target.value })}
                className="h-7 w-[130px] border-0 bg-zinc-100/70 hover:bg-zinc-100 focus:bg-white text-[12px] text-zinc-800 rounded-lg"
              />
              {/* 结构呼吸微竖线 */}
              <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-0.5 shrink-0" aria-hidden="true" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] px-3 text-[12px] font-medium text-white transition-all shadow-2xs cursor-pointer"
          >
            <Download className="size-3.5 stroke-[2]" />
            <span>{isExporting ? "导出中..." : "导出"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
