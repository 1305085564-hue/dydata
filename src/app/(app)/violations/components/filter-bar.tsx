"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import {
  GUIDANCE_METHOD_LABELS,
  type GuidanceMethod,
  type SortKey,
} from "./types";

const ALL_GUIDANCE_METHODS = Object.keys(
  GUIDANCE_METHOD_LABELS,
) as GuidanceMethod[];

/** 员工排序选项 — 不再分 violation / conversion 两套，合并展示 */
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "pass_rate", label: "通过率" },
  { key: "usage_count", label: "使用次数" },
  { key: "created_at", label: "最新提交" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeSort = (searchParams.get("sort") ?? "pass_rate") as SortKey;
  const activeOrder = (searchParams.get("order") ?? "desc") as "asc" | "desc";
  const rawGuidance = searchParams.get("guidance_method");
  const activeGuidanceMethods: GuidanceMethod[] = rawGuidance
    ? (rawGuidance.split(",").filter(Boolean) as GuidanceMethod[])
    : [];

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      return params.toString();
    },
    [searchParams],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      const [sort, order] = value.split(":") as [SortKey, "asc" | "desc"];
      const query = createQueryString({ sort, order });
      startTransition(() => {
        router.push(`?${query}`, { scroll: false });
      });
    },
    [createQueryString, router],
  );

  const toggleGuidanceMethod = useCallback(
    (method: GuidanceMethod) => {
      const next = activeGuidanceMethods.includes(method)
        ? activeGuidanceMethods.filter((m) => m !== method)
        : [...activeGuidanceMethods, method];
      const query = createQueryString({
        guidance_method: next.length > 0 ? next[0] : null,
      });
      startTransition(() => {
        router.push(`?${query}`, { scroll: false });
      });
    },
    [activeGuidanceMethods, createQueryString, router],
  );

  const handleReset = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sort");
    params.delete("order");
    params.delete("guidance_method");
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }, [searchParams, router]);

  const hasActiveFilters =
    activeGuidanceMethods.length > 0 ||
    activeSort !== "pass_rate" ||
    activeOrder !== "desc";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 导粉方式 pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_GUIDANCE_METHODS.map((method) => {
          const active = activeGuidanceMethods.includes(method);
          return (
            <button
              key={method}
              type="button"
              onClick={() => toggleGuidanceMethod(method)}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors active:translate-y-0 ${
                active
                  ? "border-[#D97757]/40 text-[#D97757]"
                  : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"
              }`}
            >
              {GUIDANCE_METHOD_LABELS[method]}
            </button>
          );
        })}
      </div>

      {/* 排序 */}
      <select
        value={`${activeSort}:${activeOrder}`}
        onChange={(e) => handleSortChange(e.target.value)}
        className="h-8 cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] text-stone-700 outline-none transition-colors focus:border-stone-300"
      >
        {SORT_OPTIONS.map((opt) => (
          <optgroup key={opt.key} label={opt.label}>
            <option value={`${opt.key}:desc`}>{opt.label}从高到低</option>
            <option value={`${opt.key}:asc`}>{opt.label}从低到高</option>
          </optgroup>
        ))}
      </select>

      {/* 重置 */}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-[12px] text-stone-500 transition-colors hover:text-stone-800 active:translate-y-0"
        >
          <RotateCcw className="size-3 stroke-[1.5]" />
          重置
        </button>
      ) : null}
    </div>
  );
}
