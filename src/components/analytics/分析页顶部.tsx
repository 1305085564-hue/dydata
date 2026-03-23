"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import { cn } from "@/lib/utils";

interface AnalyticsPageHeaderProps {
  preset: AnalyticsRangePreset;
  from: string;
  to: string;
}

const presetOptions: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "本月", value: "month" },
  { label: "自定义", value: "custom" },
];

export function AnalyticsPageHeader({ preset, from, to }: AnalyticsPageHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateRange(nextPreset: AnalyticsRangePreset, overrides?: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", nextPreset);

    if (nextPreset === "custom") {
      params.set("from", overrides?.from ?? params.get("from") ?? from);
      params.set("to", overrides?.to ?? params.get("to") ?? to);
    } else {
      params.delete("from");
      params.delete("to");
    }

    router.push(`${pathname}?${params.toString()}`);
  }

  function getExportHref() {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return `/api/export?${params.toString()}`;
  }

  return (
    <section className="rounded-[var(--radius-2xl)] border border-white/60 bg-[var(--glass-bg)] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Hit Analysis</p>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">爆款分析</h1>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">按团队范围查看整体趋势，并根据权限查看个人明细。</p>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap gap-2">
            {presetOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={preset === option.value ? "default" : "outline"}
                className={cn(
                  "transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]",
                  preset === option.value ? "shadow-[var(--shadow-card)]" : "bg-white/70",
                )}
                onClick={() => updateRange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {preset === "custom" ? (
              <>
                <label className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span>开始日期</span>
                  <Input
                    type="date"
                    value={from}
                    onChange={(event) => updateRange("custom", { from: event.target.value, to })}
                    className="h-9 w-[168px] bg-white/80"
                  />
                </label>
                <label className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span>结束日期</span>
                  <Input
                    type="date"
                    value={to}
                    onChange={(event) => updateRange("custom", { from, to: event.target.value })}
                    className="h-9 w-[168px] bg-white/80"
                  />
                </label>
              </>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-white/60 bg-white/70 px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                {from} 至 {to}
              </div>
            )}

            <Link
              href={getExportHref()}
              className="inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] hover:brightness-105 active:scale-[0.97]"
            >
              <Download className="size-4" />
              导出数据
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
