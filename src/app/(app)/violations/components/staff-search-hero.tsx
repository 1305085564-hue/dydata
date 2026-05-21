"use client";

import { Search, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StaffSearchHero({
  defaultQuery = "",
  totalCases,
}: {
  defaultQuery?: string;
  totalCases: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    router.push(`/violations${params.toString() ? `?${params.toString()}` : ""}#cases`);
  };

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="leading-tight">
          <p className="text-[12px] font-medium text-zinc-500">先在已沉淀的话术里搜一遍</p>
          <p className="text-[13px] text-zinc-400">
            团队已积累 <span className="font-mono tabular-nums text-zinc-700">{totalCases}</span> 条案例
          </p>
        </div>
        <Link
          href="/violations/submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          <FilePlus2 className="size-4 stroke-[1.5]" />
          没找到，交一条
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入场景或关键词"
          className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 pl-11 pr-28 text-sm text-zinc-800 placeholder:text-zinc-400 transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 inline-flex h-9 -translate-y-1/2 items-center gap-1 rounded-xl bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
        >
          找一下
        </button>
      </form>
    </section>
  );
}
