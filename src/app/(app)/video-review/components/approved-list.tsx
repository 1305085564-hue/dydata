"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, User } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";
import { cn } from "@/lib/utils";
import { ApprovedRow } from "./approved-row";
import type { ApprovedDraftItem } from "./types";

interface ApprovedListProps {
  items: ApprovedDraftItem[];
  query: string;
  currentUserId: string;
}

interface LightboxState {
  paths: string[];
  index: number;
}

export function ApprovedList({ items, query, currentUserId }: ApprovedListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(query);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

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

  const filteredItems = useMemo(
    () => (onlyMine ? items.filter((item) => item.submitted_by === currentUserId) : items),
    [items, onlyMine, currentUserId],
  );

  const totalText = useMemo(
    () => onlyMine ? `我的 ${filteredItems.length} 条 / 共 ${items.length}` : `共 ${items.length} 条`,
    [filteredItems.length, items.length, onlyMine],
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyMine(!onlyMine)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors",
                onlyMine
                  ? "border-[#D97757] bg-[#D97757]/5 text-[#D97757]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-800",
              )}
            >
              <User className="size-3.5 stroke-[1.5]" />
              只看自己
            </button>
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
        </div>

        <div className="max-h-[calc(100vh-320px)] overflow-hidden overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
          {filteredItems.map((item, idx) => (
            <ApprovedRow
              key={item.id}
              item={item}
              isLast={idx === filteredItems.length - 1}
              isMine={item.submitted_by === currentUserId}
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
