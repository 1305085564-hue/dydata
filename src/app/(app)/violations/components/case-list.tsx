"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { CaseDetailDialog } from "@/components/case-detail-dialog";
import { ImageLightbox } from "@/components/image-lightbox";

import { CaseRow } from "./case-row";
import { FilterBar } from "./filter-bar";
import { RankBoard } from "./rank-board";
import type { RankItem, ViolationCase } from "./types";

interface CaseListProps {
  cases: ViolationCase[];
  conversionRankItems: RankItem[];
  violationRankItems: RankItem[];
  canManageViolations: boolean;
  isOwner: boolean;
  totalCases?: number;
  query?: string;
  emptyState?: React.ReactNode;
}

interface LightboxState {
  paths: string[];
  index: number;
}

/** URL 上的弹窗锚点 — `?case=xxx` */
const CASE_PARAM = "case";

export function CaseList({
  cases,
  conversionRankItems,
  violationRankItems,
  canManageViolations,
  isOwner,
  totalCases,
  query,
  emptyState,
}: CaseListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * 弹窗状态由 URL 单一来源驱动 —
   *   - 打开 = router.replace 写入 ?case=xxx
   *   - 关闭 = 删除 ?case
   *   - 浏览器后退键、深链分享、刷新都自然生效
   */
  const dialogCaseId = searchParams.get(CASE_PARAM);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // 弹窗里所有可被 j/k 翻动的案例 id 列表（来自当前列表）
  const navigableIds = useMemo(() => cases.map((c) => c.id), [cases]);

  /** 写入 URL 的辅助：保留其他 query，只动 ?case= */
  const writeCaseParam = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(CASE_PARAM, id);
      else params.delete(CASE_PARAM);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleOpenDetail = useCallback(
    (id: string) => {
      writeCaseParam(id);
    },
    [writeCaseParam],
  );

  const handleCloseDialog = useCallback(
    (open: boolean) => {
      if (!open) writeCaseParam(null);
    },
    [writeCaseParam],
  );

  const handleOpenLightbox = useCallback((paths: string[], index: number) => {
    setLightbox({ paths, index });
  }, []);

  /**
   * j / k 翻案例 — 弹窗打开时拦截
   */
  useEffect(() => {
    if (!dialogCaseId) return;
    if (navigableIds.length === 0) return;

    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      const idx = navigableIds.indexOf(dialogCaseId ?? "");
      if (idx < 0) return;
      const nextIdx =
        key === "j"
          ? Math.min(navigableIds.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      if (nextIdx === idx) return;
      e.preventDefault();
      writeCaseParam(navigableIds[nextIdx]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogCaseId, navigableIds, writeCaseParam]);

  const showCount = typeof totalCases === "number" && cases.length > 0;

  return (
    <>
      {/* Dual Rank Boards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RankBoard
          title="高转化话术"
          subtitle="转化率排行 · 样本≥3"
          items={conversionRankItems}
          metricLabel="转化率"
          metricKey="conversion_rate"
          accentColor="#6FAA7D"
          emptyHint="样本不足，暂无排名"
          onItemClick={handleOpenDetail}
        />
        <RankBoard
          title="高风险话术"
          subtitle="违规率排行 · 样本≥3"
          items={violationRankItems}
          metricLabel="违规率"
          metricKey="pass_rate"
          accentColor="#C9604D"
          emptyHint="样本不足，暂无排名"
          onItemClick={handleOpenDetail}
        />
      </section>

      {/* List header + Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showCount ? (
          <h2 className="text-[13px] font-medium text-stone-700">
            {query ? `「${query}」的搜索结果` : "话术列表"}
            <span className="ml-2 text-[12px] text-stone-500 tabular-nums">
              {totalCases}
            </span>
          </h2>
        ) : <span />}
        <FilterBar />
      </div>

      {/* 大白卡列表（rounded-2xl border bg-white），内部行靠 border-b 分隔 */}
      {cases.length === 0 ? (
        emptyState
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {cases.map((caseItem) => (
              <li key={caseItem.id}>
                <CaseRow caseItem={caseItem} onOpenDetail={handleOpenDetail} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detail Dialog */}
      <CaseDetailDialog
        caseId={dialogCaseId}
        open={dialogCaseId !== null}
        onOpenChange={handleCloseDialog}
        onOpenLightbox={handleOpenLightbox}
        canManage={canManageViolations}
        isOwner={isOwner}
      />

      {/* Lightbox */}
      {lightbox ? (
        <ImageLightbox
          paths={lightbox.paths}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox({ ...lightbox, index })}
        />
      ) : null}
    </>
  );
}
