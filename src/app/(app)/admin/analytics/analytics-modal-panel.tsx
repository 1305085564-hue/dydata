"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import type { AnalyticsPageData } from "@/lib/loaders/analytics-page";
import { cn } from "@/lib/utils";

import { AnalyticsContent } from "./analytics-content";

const presetOptions: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
  { label: "本月", value: "month" },
  { label: "自定义", value: "custom" },
];

interface AnalyticsModalPanelProps {
  initialPreset?: AnalyticsRangePreset;
}

function AnalyticsModalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100/80" />
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100/80" />
      </div>
      <div className="h-12 animate-pulse rounded-[20px] bg-slate-100/80" />
      <div className="h-80 animate-pulse rounded-[28px] bg-slate-100/80" />
    </div>
  );
}

export function AnalyticsModalPanel({ initialPreset = "30d" }: AnalyticsModalPanelProps) {
  const [data, setData] = useState<AnalyticsPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preset, setPreset] = useState<AnalyticsRangePreset>(initialPreset);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPanel() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("preset", preset);
        if (preset === "custom" && from && to) {
          params.set("from", from);
          params.set("to", to);
        }

        const response = await fetch(`/api/admin/panels/analytics?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as AnalyticsPageData & { error?: string };

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "加载经营分析失败");
        }

        if (!cancelled) {
          setData(payload);
          if (!from) setFrom(payload.range.from);
          if (!to) setTo(payload.range.to);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "加载经营分析失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPanel();

    return () => {
      cancelled = true;
    };
  }, [preset, from, to]);

  if (isLoading && !data) {
    return <AnalyticsModalSkeleton />;
  }

  if (error && !data) {
    return <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[28px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,249,255,0.92))] p-5 shadow-[var(--shadow-card)]">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
              经营分析
            </p>
            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">经营分析工作台</h3>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              面板打开后再加载分析数据，避免切换入口时触发整页后台重渲染。
            </p>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[var(--shadow-light)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">当前周期</p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
            {data.range.from} 至 {data.range.to}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            仍保留原有权限裁剪逻辑，只把取数时机延后到真正打开面板时。
          </p>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/75 bg-white/82 p-4 shadow-[var(--shadow-light)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-text-secondary)]">快捷时间切换</p>
            <div className="flex flex-wrap gap-2">
              {presetOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={preset === option.value ? "default" : "outline"}
                  className={cn(
                    "h-8 rounded-full px-4 text-xs",
                    preset === option.value ? "border-transparent" : "border-white/70 bg-white/88",
                  )}
                  onClick={() => setPreset(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {preset === "custom" ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                <span>开始日期</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-9 rounded-xl border border-white/80 bg-white/90 px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                <span>结束日期</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-9 rounded-xl border border-white/80 bg-white/90 px-3 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? <AnalyticsModalSkeleton /> : null}
      {error ? <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <AnalyticsContent
        userId={data.userId}
        isPrivilegedUser={data.isPrivilegedUser}
        filteredReports={data.filteredReports}
        filteredVideos={data.filteredVideos}
        filteredSnapshots={data.filteredSnapshots}
        filteredVideoTags={data.filteredVideoTags}
        submitters={data.submitters}
      />
    </div>
  );
}
