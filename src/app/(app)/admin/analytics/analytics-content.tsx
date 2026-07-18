"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { type AnalyticsPageData } from "@/lib/loaders/analytics-page";

import { AnalyticsWorkbench } from "./analytics-workbench";

interface AnalyticsContentProps {
  userId: string;
  initialData?: AnalyticsPageData;
  // Legacy mode: pass all data directly (used by analytics-modal-panel)
  isPrivilegedUser?: boolean;
  filteredReports?: Parameters<typeof AnalyticsWorkbench>[0]["filteredReports"];
  previousPeriodReports?: Parameters<typeof AnalyticsWorkbench>[0]["previousPeriodReports"];
  submitters?: string[];
  // Self-fetch mode: pass URL params (used by page.tsx)
  preset?: string;
  from?: string;
  to?: string;
}

function LoadingSpinner() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="h-32 rounded-2xl bg-stone-100" />
      <div className="h-32 rounded-2xl bg-stone-100" />
      <div className="h-32 rounded-2xl bg-stone-100" />
    </div>
  );
}

export function AnalyticsContent({
  userId,
  initialData,
  isPrivilegedUser: propIsPrivilegedUser,
  filteredReports: propFilteredReports,
  previousPeriodReports: propPreviousPeriodReports,
  submitters: propSubmitters,
  preset,
  from: initialFrom,
  to: initialTo,
}: AnalyticsContentProps) {
  const isLegacy = propFilteredReports !== undefined;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<AnalyticsPageData | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, AnalyticsPageData>>(new Map());

  const load = useCallback(
    async (p: AnalyticsRangePreset, f?: string, t?: string) => {
      const key = `${p}:${f ?? ""}:${t ?? ""}`;
      const cached = cacheRef.current.get(key);
      if (cached) {
        setData(cached);
        setIsLoading(false);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("preset", p);
        if (f) params.set("from", f);
        if (t) params.set("to", t);

        const res = await fetch(`/api/admin/panels/analytics?${params.toString()}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "加载失败");
        }
        const json: AnalyticsPageData = await res.json();
        cacheRef.current.set(key, json);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isLegacy) return;
    const p = (searchParams.get("preset") ?? preset ?? "30d") as AnalyticsRangePreset;
    const f = searchParams.get("from") ?? initialFrom ?? undefined;
    const t = searchParams.get("to") ?? initialTo ?? undefined;

    if (initialData && initialData.range.preset === p &&
        (p !== "custom" || (initialData.range.from === f && initialData.range.to === t))) {
      setData(initialData);
      const key = `${p}:${f ?? ""}:${t ?? ""}`;
      cacheRef.current.set(key, initialData);
      setIsLoading(false);
      setError(null);
      return;
    }

    load(p, f, t);
  }, [searchParams, preset, initialFrom, initialTo, load, isLegacy, initialData]);

  const handleRangeChange = useCallback(
    (nextPreset: AnalyticsRangePreset, overrides?: { from?: string; to?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("preset", nextPreset);
      if (nextPreset === "custom") {
        params.set("from", overrides?.from ?? data?.range.from ?? "");
        params.set("to", overrides?.to ?? data?.range.to ?? "");
      } else {
        params.delete("from");
        params.delete("to");
      }
      
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname, searchParams, data]
  );

  if (isLegacy) {
    return (
      <AnalyticsWorkbench
        userId={userId}
        isPrivilegedUser={propIsPrivilegedUser!}
        filteredReports={propFilteredReports!}
        previousPeriodReports={propPreviousPeriodReports!}
        submitters={propSubmitters!}
      />
    );
  }

  const currentPreset = (data?.range.preset ?? ((searchParams.get("preset") || preset) ?? "30d")) as AnalyticsRangePreset;
  const currentFrom = data?.range.from ?? searchParams.get("from") ?? initialFrom ?? "";
  const currentTo = data?.range.to ?? searchParams.get("to") ?? initialTo ?? "";

  const hasVisibleData = !!data;
  const showGlobalLoading = !hasVisibleData && isLoading;

  return (
    <div className="space-y-4">
      <AnalyticsPageHeader preset={currentPreset} from={currentFrom} to={currentTo} onChange={handleRangeChange} />

      {error && !hasVisibleData ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-[13px] text-[#B24E3E] border-l-[2px] border-l-[#C9604D]">
          加载失败：{error}
        </div>
      ) : null}

      {showGlobalLoading ? <LoadingSpinner /> : null}

      {hasVisibleData ? (
        <AnalyticsWorkbench
          userId={userId}
          isPrivilegedUser={data.isPrivilegedUser}
          filteredReports={data.filteredReports}
          previousPeriodReports={data.previousPeriodReports}
          submitters={data.submitters}
        />
      ) : null}
    </div>
  );
}
