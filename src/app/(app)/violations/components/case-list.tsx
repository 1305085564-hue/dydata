"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { CaseDetailDrawer } from "@/components/case-detail-drawer";
import { CaseReviewDialog } from "@/components/case-review-dialog";
import { ImageLightbox } from "@/components/image-lightbox";

import { CaseCard } from "./case-card";
import { RankBoard } from "./rank-board";
import type { RankItem, ViolationCase, ViolationDetail } from "./types";

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

/** URL 上的抽屉锚点 — `?case=xxx` */
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
   * 抽屉状态由 URL 单一来源驱动 —
   *   - 打开抽屉 = router.replace 写入 ?case=xxx
   *   - 关闭抽屉 = 删除 ?case
   *   - 浏览器后退键、深链分享、刷新都自然生效
   */
  const drawerCaseId = searchParams.get(CASE_PARAM);

  const [reviewCase, setReviewCase] = useState<ViolationDetail | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // 抽屉里所有可被 j/k 翻动的案例 id 列表（来自当前列表）
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

  const handleCloseDrawer = useCallback(
    (open: boolean) => {
      if (!open) writeCaseParam(null);
    },
    [writeCaseParam],
  );

  const handleOpenLightbox = useCallback((paths: string[], index: number) => {
    setLightbox({ paths, index });
  }, []);

  const handleOpenReviewFromCard = useCallback((caseItem: ViolationCase) => {
    setReviewCase(caseItem as ViolationDetail);
  }, []);

  const handleOpenReviewFromDrawer = useCallback((caseData: ViolationDetail) => {
    setReviewCase(caseData);
  }, []);

  const handleCloseReview = useCallback((open: boolean) => {
    if (!open) setReviewCase(null);
  }, []);

  /**
   * j / k 翻案例 — 抽屉打开时拦截，无需先关闭抽屉
   * 兼容 ←/→ 不抢，留给输入框
   */
  useEffect(() => {
    if (!drawerCaseId) return;
    if (navigableIds.length === 0) return;

    function onKey(e: KeyboardEvent) {
      // 只接受 j / k / J / K，避免和 ImageLightbox 的 ←/→ 冲突
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;

      // 输入区域按键不拦截
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      const idx = navigableIds.indexOf(drawerCaseId ?? "");
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
  }, [drawerCaseId, navigableIds, writeCaseParam]);

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
          viewAllHref="/violations?tab=safe&sort=conversion_rate&order=desc"
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
          viewAllHref="/violations?tab=risk&sort=pass_rate&order=asc"
          onItemClick={handleOpenDetail}
        />
      </section>

      {/* List header */}
      {showCount ? (
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-zinc-700">
            {query ? `「${query}」的搜索结果` : "话术列表"}
            <span className="ml-2 font-mono text-[12px] text-zinc-400 tabular-nums">
              {totalCases}
            </span>
          </h2>
        </div>
      ) : null}

      {/* Empty state or two-column card grid */}
      {cases.length === 0 ? (
        emptyState
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cases.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              onOpenDetail={handleOpenDetail}
              onOpenLightbox={handleOpenLightbox}
              onOpenReview={handleOpenReviewFromCard}
              canManageViolations={canManageViolations}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <CaseDetailDrawer
        caseId={drawerCaseId}
        open={drawerCaseId !== null}
        onOpenChange={handleCloseDrawer}
        onOpenLightbox={handleOpenLightbox}
        onOpenReview={handleOpenReviewFromDrawer}
        canManageViolations={canManageViolations}
      />

      {/* Review dialog */}
      {reviewCase ? (
        <CaseReviewDialog
          open={reviewCase !== null}
          onOpenChange={handleCloseReview}
          caseId={reviewCase.id}
          purpose={(reviewCase.purpose === "conversion" ? "conversion" : "violation") as "violation" | "conversion"}
          initialStatus={reviewCase.status}
          initialUsageState={reviewCase.usage_state}
          initialRiskLevel={reviewCase.risk_level}
          initialPromotionLevel={reviewCase.promotion_level}
          initialAdminConclusion={reviewCase.admin_conclusion}
          initialSuggestedAction={reviewCase.suggested_action}
          initialReasonTagIds={[]}
          isOwner={isOwner}
        />
      ) : null}

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
