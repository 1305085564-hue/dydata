"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import {
  GUIDANCE_METHOD_LABELS,
  SORT_OPTIONS,
  type GuidanceMethod,
  type SortKey,
} from "./types";

const ALL_GUIDANCE_METHODS = Object.keys(
  GUIDANCE_METHOD_LABELS,
) as GuidanceMethod[];

interface FilterBarProps {
  purpose?: "violation" | "conversion";
}

export function FilterBar({ purpose = "violation" }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeSort = (searchParams.get("sort") ?? "pass_rate") as SortKey;
  const activeOrder = (searchParams.get("order") ?? "desc") as "asc" | "desc";
  const rawGuidance = searchParams.get("guidance_method");
  const activeGuidanceMethods: GuidanceMethod[] = rawGuidance
    ? (rawGuidance.split(",").filter(Boolean) as GuidanceMethod[])
    : [];

  const availableSortOptions = SORT_OPTIONS.filter((opt) =>
    opt.applicablePurposes.includes(purpose),
  );

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
      // API currently supports single guidance_method only
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
      {/* Guidance method pills */}
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
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >
              {GUIDANCE_METHOD_LABELS[method]}
            </button>
          );
        })}
      </div>

      {/* Sort selector */}
      <select
        value={`${activeSort}:${activeOrder}`}
        onChange={(e) => handleSortChange(e.target.value)}
        className="h-8 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] text-zinc-700 outline-none transition-colors focus:border-zinc-300"
      >
        {availableSortOptions.map((opt) => (
          <optgroup key={opt.key} label={opt.label}>
            <option value={`${opt.key}:desc`}>{opt.label}从高到低</option>
            <option value={`${opt.key}:asc`}>{opt.label}从低到高</option>
          </optgroup>
        ))}
      </select>

      {/* Reset */}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-800 active:translate-y-0"
        >
          <RotateCcw className="size-3 stroke-[1.5]" />
          重置
        </button>
      ) : null}
    </div>
  );
}
