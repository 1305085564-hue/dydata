"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, User } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";
import { cn } from "@/lib/utils";
import { CaseCard } from "./case-card";
import { CaseDetailDialog } from "./case-detail-dialog";
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

export function ApprovedListEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-stone-50 text-stone-500">
        <Search className="size-5 stroke-[1.5]" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-stone-700">没有符合条件的已发案例</p>
      <p className="mt-1 max-w-sm text-[12px] text-stone-500">
        {hasFilters
          ? "请调整搜索词或关闭「只看自己」后再查看。"
          : "此页面仅保留历史记录，新的作品请前往数据台提交。"}
      </p>
    </div>
  );
}

export function ApprovedList({ items, query, currentUserId }: ApprovedListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(query);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  
  // 选中的详细卡片
  const [detailItem, setDetailItem] = useState<ApprovedDraftItem | null>(null);

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
        {/* 顶部操作区 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[18px] font-medium text-stone-900">已发作品案例</h2>
            <span className="text-[12px] tabular-nums text-stone-500">
              {totalText}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 只看自己开关 */}
            <button
              type="button"
              onClick={() => setOnlyMine(!onlyMine)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors active:scale-95",
                onlyMine
                  ? "border-[#8AA8C7] bg-[#8AA8C7]/10 text-[#8AA8C7]"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700",
              )}
            >
              <User className="size-3.5 stroke-[1.5]" />
              只看自己
            </button>

            {/* 搜索框 */}
            <form onSubmit={handleSubmitSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 stroke-[1.5] text-stone-500" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="搜已发文案内容..."
                  className="h-9 w-48 rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 text-[12px] text-stone-700 placeholder:text-stone-500 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 sm:w-64"
                />
              </div>
            </form>
          </div>
        </div>

        {/* 卡片网格瀑布流/网格布局 (L1 容器，bg-stone-100 上自然浮现，间距 24px/16px) */}
        {filteredItems.length === 0 ? (
          <ApprovedListEmptyState hasFilters={Boolean(query.trim()) || onlyMine} />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredItems.map((item) => (
              <CaseCard
                key={item.id}
                item={item}
                isMine={item.submitted_by === currentUserId}
                onOpenLightbox={handleOpenLightbox}
                onOpenDetail={(it) => setDetailItem(it)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 案例详情 Dialog */}
      <CaseDetailDialog
        item={detailItem}
        open={Boolean(detailItem)}
        onOpenChange={(open) => !open && setDetailItem(null)}
        onOpenLightbox={handleOpenLightbox}
      />

      {/* 图片灯箱大图查看器 */}
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
