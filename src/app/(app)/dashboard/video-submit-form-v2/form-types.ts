import type { Video } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { LastSubmittedReportPreferences } from "@/lib/video-submit-preferences";
import type { VideoSubmissionEditDetail } from "@/lib/video-submit/domain/video-submit-form-state";
import type {
  SubmitPanelMode,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import type { FormProgress } from "@/lib/video-submit/domain/submit-gaps";

export interface VideoSubmitFormProps {
  account: {
    id: string;
    name: string;
    display_name: string;
    content_direction: string | null;
  } | null;
  userId: string;
  userDisplayName?: string;
  today: string;
  mode: SubmitPanelMode;
  initialSummary: TodaySubmissionSummary | null;
  editDetail?: VideoSubmissionEditDetail | null;
  initialBizDate?: string | null;
  initialTopicId?: string | null;
  initialTopicTitle?: string | null;
  submittedViewActive?: boolean;
  userExemptionReviewNotices?: DashboardPageData["userExemptionReviewNotices"];
  isExemptionPending?: boolean;
  pendingExemptionItems?: DashboardPageData["pendingExemptionItems"];
  lastSubmissionPreferences?: LastSubmittedReportPreferences | null;
  onDismissPendingExemption?: () => void;
  onWithdrawPendingExemption?: () => Promise<unknown>;
  onSubmitted: (
    video: Video | null,
    summaryOverride?: TodaySubmissionReportLike | null,
    submissionPreferences?: LastSubmittedReportPreferences & { accountId: string },
  ) => void;
  onCancel?: () => void;
  onCreateAnother?: () => void;
  onRequestEdit?: (target: { reportId: string | null; reportDate: string }) => void;
  onViewHistory?: () => void;
  onViewVideo?: (videoId: string) => void;
  /** 表单进度回传给页头状态句（还差一步 / 可以交了），卸载时回 null */
  onProgressChange?: (progress: FormProgress | null) => void;
}
