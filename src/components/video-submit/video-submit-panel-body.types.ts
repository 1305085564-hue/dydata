import type { RefObject } from "react";

import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionState } from "@/lib/豁免";
import type {
  SubmitPanelMode,
  SubmissionDayStatus,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import type { MonthReport } from "@/lib/video-submit/domain/types";
import type { Video, VideoTagReviewDimension } from "@/types";
import type { VideoSubmissionEditDetail } from "@/app/(app)/dashboard/video-submit-form-state";

export type VideoSubmitPanelBodyProps = {
  formAnchorRef: RefObject<HTMLDivElement | null>;
  shouldShowForm: boolean;
  isExemptionPending: boolean;
  dismissedPendingExemption: boolean;
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  dismissedReviewNotice: boolean;
  handleDismissReviewNotice: () => void;
  dismissPendingExemption: () => void;
  isPrimarySummaryMode: boolean;
  shouldShowBlockedStateCard: boolean;
  activeBizDate: string;
  today: string;
  submittedViewActive: boolean;
  setSubmittedViewActive: (active: boolean) => void;
  primarySummary: TodaySubmissionSummary;
  handleGoToTopics: () => void;
  activeDateStatus: SubmissionDayStatus;
  activeExemptionState: ExemptionState;
  shouldShowActivityErrorCard: boolean;
  loadActivity: () => void | Promise<void>;
  shouldShowActivityLoadingCard: boolean;
  shouldShowHistoricalSubmittedCard: boolean;
  activeDateReport: MonthReport | null;
  setRequestedMode: (mode: "editToday" | "backfill" | null) => void;
  shouldShowEditDetailLoading: boolean;
  shouldShowEditDetailError: boolean;
  editDetailLoadState: { status: string; detail: VideoSubmissionEditDetail | null; error: string | null };
  setEditDetailRequestVersion: (updater: (value: number) => number) => void;
  onActiveBizDateChange?: (date: string) => void;
  selectedAccount: { id: string; name: string; display_name: string; content_direction: string | null } | null;
  userId: string;
  userDisplayName: string;
  primaryMode: SubmitPanelMode;
  initialTopicId: string | null;
  initialTopicTitle: string | null;
  handleSubmitted: (
    video: Video,
    aiTags: Array<{
      tag_dimension: VideoTagReviewDimension;
      tag_value: string;
      confidence: number | null;
      reason: string | null;
    }>,
    summaryOverride?: TodaySubmissionReportLike | null,
  ) => void;
};
