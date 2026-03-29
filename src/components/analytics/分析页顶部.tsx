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
    <section className="rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,249,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-text-tertiary)] uppercase">Business Analytics</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--color-text-primary)] sm:text-[30px]">经营分析总览</h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">先看核心结论判断方向，再下钻到各分析模块，减少信息噪音，提升决策速度。</p>
            </div>
          </div>

          <div className="grid gap-2 rounded-[18px] border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[280px]">
            <div className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
              <CalendarDays className="size-3.5 text-[var(--color-primary)]" />
              当前分析周期
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{from} 至 {to}</p>
            <p>口径统一后再看趋势，结论更稳定。</p>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/75 bg-white/72 p-4 backdrop-blur-[12px] sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-text-secondary)]">快捷时间切换</p>
              <div className="flex flex-wrap gap-2">
                {presetOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={preset === option.value ? "default" : "outline"}
                    className={cn(
                      "h-8 rounded-full px-4 text-xs transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]",
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
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-primary/15 bg-primary px-4 text-xs font-medium text-primary-foreground transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] hover:brightness-105 active:scale-[0.97]"
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
