"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  function getExportHref() {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return `/api/export?${params.toString()}`;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[14px] font-medium tracking-tight text-zinc-800">经营分析总览</h2>
        <span className="font-mono text-[12px] tabular-nums text-zinc-500">
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
                    ? "border-transparent bg-[#D97757] text-white hover:bg-[#C96442]"
                    : "border-zinc-200 bg-white text-zinc-600",
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
                className="h-8 w-[140px] border-zinc-200 bg-white text-[12px]"
              />
              <span className="text-[12px] text-zinc-400">→</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => onChange("custom", { from, to: event.target.value })}
                className="h-8 w-[140px] border-zinc-200 bg-white text-[12px]"
              />
            </div>
          ) : null}

          <Link
            href={getExportHref()}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-[background-color] duration-150 hover:bg-[#C96442] active:translate-y-0"
          >
            <Download className="size-3.5 stroke-[1.5]" />
            导出
          </Link>
        </div>
      </div>
    </section>
  );
}
