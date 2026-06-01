"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";
import { ApprovedRow } from "./approved-row";
import type { ApprovedDraftItem } from "./types";

interface ApprovedListProps {
  items: ApprovedDraftItem[];
  query: string;
}

interface LightboxState {
  paths: string[];
  index: number;
}

export function ApprovedList({ items, query }: ApprovedListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(query);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const handleOpenLightbox = useCallback((paths: string[], index: number) => {
    if (paths.length > 0) setLightbox({ paths, index });
  }, []);

  const handleSubmitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchValue.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams, searchValue],
  );

  const totalText = useMemo(
    () => `共 ${items.length} 条`,
    [items.length],
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-zinc-800">已发列表</h2>
            <span className="font-mono text-[12px] tabular-nums text-zinc-400">
              {totalText}
            </span>
          </div>
          <form
            onSubmit={handleSubmitSearch}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 stroke-[1.5] text-zinc-400" />
              <input
                type="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="搜话术内容"
                className="h-9 rounded-lg border border-transparent bg-zinc-100/70 pl-8 pr-3 text-[13px] text-zinc-800 placeholder:text-zinc-400 transition-colors focus:border-zinc-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
              />
            </div>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {items.map((item, idx) => (
            <ApprovedRow
              key={item.id}
              item={item}
              isLast={idx === items.length - 1}
              onOpenLightbox={handleOpenLightbox}
            />
          ))}
        </div>
      </div>

      {lightbox ? (
        <ImageLightbox
          paths={lightbox.paths}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(idx) =>
            setLightbox((prev) => (prev ? { ...prev, index: idx } : prev))
          }
        />
      ) : null}
    </>
  );
}
