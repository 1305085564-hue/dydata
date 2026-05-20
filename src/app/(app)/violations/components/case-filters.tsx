"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { VIOLATION_CATEGORIES } from "./format";

type PerspectiveKey = "violation" | "conversion" | "review";

type ChipOption = {
  value: string;
  label: string;
};

const VIOLATION_STATUS_OPTIONS: ChipOption[] = [
  { value: "all", label: "全部" },
  { value: "verified_violation", label: "已确认违规" },
  { value: "verified_safe", label: "已确认可用" },
  { value: "submitted", label: "待验证" },
  { value: "rejected", label: "已驳回" },
];

const CATEGORY_OPTIONS: ChipOption[] = [
  { value: "all", label: "全部" },
  ...VIOLATION_CATEGORIES.map((item) => ({ value: item, label: item })),
];

export type CaseFiltersProps = {
  perspective: PerspectiveKey;
  status?: string;
  category?: string;
  query?: string;
};

function chipClass(active: boolean) {
  const base =
    "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors select-none";
  if (active) {
    return `${base} border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757]`;
  }
  return `${base} border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800`;
}

export function CaseFilters({
  perspective,
  status = "all",
  category = "all",
  query = "",
}: CaseFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [input, setInput] = useState(query);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const buildHref = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("perspective", perspective);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === "all") {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      return `/violations?${next.toString()}`;
    },
    [perspective, searchParams],
  );

  const pushPatch = useCallback(
    (patch: Record<string, string | undefined>) => {
      startTransition(() => {
        router.replace(buildHref(patch));
      });
    },
    [buildHref, router],
  );

  useEffect(() => {
    if (input === query) return;
    const handle = window.setTimeout(() => {
      pushPatch({ q: input.trim() || undefined });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [input, query, pushPatch]);

  const groups = useMemo(
    () => [
      { key: "status", label: "状态", options: VIOLATION_STATUS_OPTIONS, value: status },
      { key: "category", label: "分类", options: CATEGORY_OPTIONS, value: category },
    ],
    [status, category],
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          name="q"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="搜索话术内容"
          className="h-11 rounded-xl border-transparent bg-zinc-100/70 pl-9 text-zinc-800 placeholder:text-zinc-400 focus-visible:border-zinc-200 focus-visible:bg-white focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5"
        />
      </label>

      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[60px] text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = (group.value ?? "all") === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => pushPatch({ [group.key]: option.value })}
                    className={chipClass(active)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
