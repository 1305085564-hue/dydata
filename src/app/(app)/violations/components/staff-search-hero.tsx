"use client";

import { Search, FilePlus2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function StaffSearchHero({
  defaultQuery = "",
  totalCases,
}: {
  defaultQuery?: string;
  totalCases: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    startTransition(() => {
      router.push(`/violations${params.toString() ? `?${params.toString()}` : ""}#cases`);
    });
  };

  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 transition-opacity ${isPending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="leading-tight">
          <p className="text-[12px] font-medium text-stone-500">先在已沉淀的话术里搜一遍</p>
          <p className="text-[13px] text-stone-500">
            团队已积累 <span className="tabular-nums text-stone-700">{totalCases}</span> 条案例
          </p>
        </div>
        <Link
          href="/violations/submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-100 active:translate-y-0"
        >
          <FilePlus2 className="size-4 stroke-[1.5]" />
          没找到，交一条
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入场景或关键词"
          disabled={isPending}
          className="h-12 w-full rounded-lg border border-stone-200 bg-stone-50 pl-11 pr-28 text-[13px] text-stone-700 placeholder:text-stone-500 transition-colors focus:border-stone-500 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-900/5 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="absolute right-2 top-1/2 inline-flex h-9 -translate-y-1/2 items-center gap-1 rounded-lg bg-[#B4532F] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#A84D2B] active:translate-y-0 disabled:cursor-not-allowed disabled:border disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-500/40 disabled:hover:bg-stone-100"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              搜索中
            </>
          ) : (
            "找一下"
          )}
        </button>
      </form>
    </section>
  );
}
