"use client";

import { useCallback, useState } from "react";

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
}

interface LightboxState {
  paths: string[];
  index: number;
}

export function CaseList({
  cases,
  conversionRankItems,
  violationRankItems,
  canManageViolations,
  isOwner,
}: CaseListProps) {
  const [drawerCaseId, setDrawerCaseId] = useState<string | null>(null);
  const [reviewCase, setReviewCase] = useState<ViolationDetail | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const handleOpenDetail = useCallback((id: string) => {
    setDrawerCaseId(id);
  }, []);

  const handleCloseDrawer = useCallback((open: boolean) => {
    if (!open) setDrawerCaseId(null);
  }, []);

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

  return (
    <>
      {/* Dual Rank Boards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RankBoard
          title="转化率排行榜"
          subtitle="样本≥3 条"
          items={conversionRankItems}
          metricLabel="转化率"
          metricKey="conversion_rate"
          accentColor="#6FAA7D"
          emptyHint="样本不足，暂无排名"
          viewAllHref="/violations?tab=safe&sort=conversion_rate&order=desc"
          onItemClick={handleOpenDetail}
        />
        <RankBoard
          title="违规率排行榜"
          subtitle="样本≥3 条"
          items={violationRankItems}
          metricLabel="违规率"
          metricKey="pass_rate"
          accentColor="#C9604D"
          emptyHint="样本不足，暂无排名"
          viewAllHref="/violations?tab=risk&sort=pass_rate&order=asc"
          onItemClick={handleOpenDetail}
        />
      </section>

      {/* Card list */}
      <div className="space-y-3">
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
