"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
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
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-12" />
      <Skeleton className="h-80" />
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
    return <ErrorState title="加载经营分析失败" description={error} />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
              经营分析
            </p>
            <h3 className="text-[20px] font-semibold tracking-tight text-zinc-800">经营分析工作台</h3>
            <p className="text-[13px] leading-[1.7] text-zinc-500">
              面板打开后再加载分析数据，避免切换入口时触发整页后台重渲染。
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">当前周期</p>
          <p className="mt-2 text-[16px] font-semibold text-zinc-800 tabular-nums">
            {data.range.from} 至 {data.range.to}
          </p>
          <p className="mt-2 text-[13px] leading-[1.7] text-zinc-500">
            仍保留原有权限裁剪逻辑，只把取数时机延后到真正打开面板时。
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">快捷时间切换</p>
            <div className="flex flex-wrap gap-2">
              {presetOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={preset === option.value ? "default" : "outline"}
                  className={cn(
                    "h-8 rounded-[10px] px-4 text-[12px]",
                    preset === option.value ? "bg-zinc-800 text-white" : "border-zinc-200",
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
              <label className="space-y-1 text-[12px] text-zinc-500">
                <span>开始日期</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-800 focus:ring-1 focus:ring-zinc-950/5 focus:border-zinc-300 outline-none"
                />
              </label>
              <label className="space-y-1 text-[12px] text-zinc-500">
                <span>结束日期</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-800 focus:ring-1 focus:ring-zinc-950/5 focus:border-zinc-300 outline-none"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? <AnalyticsModalSkeleton /> : null}
      {error ? <ErrorState title="加载经营分析失败" description={error} /> : null}

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
