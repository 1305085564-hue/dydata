"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewDecisionPanel } from "@/app/(app)/violations/[id]/components/review-decision-panel";

interface CaseReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  purpose?: "violation" | "conversion";
  initialStatus: string;
  initialUsageState?: string | null;
  initialRiskLevel?: string | null;
  initialPromotionLevel?: string | null;
  initialAdminConclusion?: string | null;
  initialSuggestedAction?: string | null;
  initialReasonTagIds?: string[];
  isOwner: boolean;
}

export function CaseReviewDialog({
  open,
  onOpenChange,
  caseId,
  purpose = "violation",
  initialStatus,
  initialUsageState,
  initialRiskLevel,
  initialPromotionLevel,
  initialAdminConclusion,
  initialSuggestedAction,
  initialReasonTagIds,
  isOwner,
}: CaseReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>审批案例</DialogTitle>
        </DialogHeader>
        <ReviewDecisionPanel
          caseId={caseId}
          purpose={purpose}
          initialStatus={initialStatus}
          initialUsageState={initialUsageState}
          initialRiskLevel={initialRiskLevel}
          initialPromotionLevel={initialPromotionLevel}
          initialAdminConclusion={initialAdminConclusion}
          initialSuggestedAction={initialSuggestedAction}
          initialReasonTagIds={initialReasonTagIds}
          isOwner={isOwner}
        />
      </DialogContent>
    </Dialog>
  );
}
