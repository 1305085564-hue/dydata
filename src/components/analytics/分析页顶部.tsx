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
    <section className="rounded-2xl border border-white/70 bg-white/82 p-3 shadow-[var(--shadow-light)] sm:p-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Business Analytics</p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-2xl">经营分析总览</h1>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{from} 至 {to}</span>
            </div>
          </div>

          <div className="grid gap-1 rounded-xl border border-white/80 bg-white/88 px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[240px]">
            <div className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
              <CalendarDays className="size-3.5 text-[var(--color-primary)]" />
              当前分析周期
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{from} 至 {to}</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/75 bg-white/72 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-text-secondary)]">快捷时间切换</p>
              <div className="flex flex-wrap gap-2">
                {presetOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={preset === option.value ? "default" : "outline"}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)]]]",
                      preset === option.value
                        ? "border-transparent shadow-[var(--shadow-light)]"
                        : "border-white/70 bg-white/88 text-[var(--color-text-secondary)]",
                    )}
                    onClick={() => updateRange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
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
                      className="h-9 w-[168px] border-white/80 bg-white/90"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                    <span>结束日期</span>
                    <Input
                      type="date"
                      value={to}
                      onChange={(event) => updateRange("custom", { from, to: event.target.value })}
                      className="h-9 w-[168px] border-white/80 bg-white/90"
                    />
                  </label>
                </>
              ) : null}

              <Link
                href={getExportHref()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-primary/15 bg-primary px-4 text-xs font-medium text-primary-foreground transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)]] hover:brightness-105]"
              >
                <Download className="size-3.5" />
                导出数据
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
