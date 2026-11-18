import type { RefObject } from "react";

import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type {
  SubmitPanelMode,
  SubmissionDayStatus,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import type { MonthReport } from "@/lib/video-submit/domain/types";
import type { Video } from "@/types";
import type { FormProgress } from "@/lib/video-submit/domain/submit-gaps";
import type { VideoSubmissionEditDetail } from "@/app/(app)/dashboard/video-submit-form-state";
import type { LastSubmittedReportPreferences } from "@/lib/video-submit-preferences";

export type VideoSubmitPanelBodyProps = {
  formAnchorRef: RefObject<HTMLDivElement | null>;
  shouldShowForm: boolean;
  isExemptionPending: boolean;
  pendingExemptionItems: DashboardPageData["pendingExemptionItems"];
  lastSubmissionPreferences: LastSubmittedReportPreferences | null;
  dismissedPendingExemption: boolean;
  userExemptionReviewNotices: DashboardPageData["userExemptionReviewNotices"];
  dismissedReviewNotice: boolean;
  handleDismissReviewNotice: () => void;
  dismissPendingExemption: () => void;
  onWithdrawPendingExemption: () => Promise<unknown>;
  isPrimarySummaryMode: boolean;
  activeBizDate: string;
  today: string;
  submittedViewActive: boolean;
  setSubmittedViewActive: (active: boolean) => void;
  primarySummary: TodaySubmissionSummary;
  handleGoToTopics: () => void;
  activeDateStatus: SubmissionDayStatus;
  shouldShowActivityErrorCard: boolean;
  loadActivity: () => void | Promise<void>;
  shouldShowActivityLoadingCard: boolean;
  shouldShowHistoricalSubmittedCard: boolean;
  activeDateReport: MonthReport | null;
  requestedEditBizDate: string | null;
  onRequestEditSubmittedReport: (target: { reportId: string | null; reportDate: string }) => void;
  onCreateAnother: () => void;
  clearSubmittedEditTarget: () => void;
  activeDateReports: MonthReport[];
  selectedReportId: string | null;
  setSelectedReportId: (reportId: string | null) => void;
  setRequestedMode: (mode: "editToday" | "backfill" | "createAnother" | null) => void;
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
    video: Video | null,
    summaryOverride?: TodaySubmissionReportLike | null,
    submissionPreferences?: LastSubmittedReportPreferences & { accountId: string },
  ) => void;
  onViewHistory: () => void;
  onViewVideo: (videoId: string) => void;
  onFormProgressChange: (progress: FormProgress | null) => void;
};
