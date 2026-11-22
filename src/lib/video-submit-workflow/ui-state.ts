import { VIDEO_SUBMIT_EXPIRED_APPEAL_REASON } from "@/lib/video-submit-deadline";

export interface SubmissionQualityIssue {
  severity: "critical" | "warning" | "info";
  field?: string;
  title: string;
  detail: string;
  suggestedFix?: "edit_field" | "reupload_screenshot" | "manual_review";
}

export interface SubmissionQualityResponse {
  reportId: string;
  overallStatus: "pass" | "warning" | "fail";
  issues: SubmissionQualityIssue[];
  checkedAt: string;
}

export type SubmissionUiState = {
  isSubmitting: boolean;
  appealRequired: boolean;
  appealStatus: "idle" | "pending" | "resume_pending" | "approved" | "rejected";
  appealId: string | null;
  appealResultReason: string | null;
  isAppealDialogOpen: boolean;
  appealReason: string;
  isAppealSubmitting: boolean;
  isSubmitted: boolean;
  hasAttemptedSubmit: boolean;
  shakeForm: boolean;
  submittedReportId: string | null;
  submittedVideoId: string | null;
  qualityCheck: { data: SubmissionQualityResponse | null; loading: boolean };
};

export type SubmissionUiAction = {
  type: "update";
  updater: (current: SubmissionUiState) => SubmissionUiState;
};

export function createSubmissionUiState(initial?: Partial<SubmissionUiState>): SubmissionUiState {
  return {
    isSubmitting: false,
    appealRequired: false,
    appealStatus: "idle",
    appealId: null,
    appealResultReason: null,
    isAppealDialogOpen: false,
    appealReason: VIDEO_SUBMIT_EXPIRED_APPEAL_REASON,
    isAppealSubmitting: false,
    isSubmitted: false,
    hasAttemptedSubmit: false,
    shakeForm: false,
    submittedReportId: null,
    submittedVideoId: null,
    qualityCheck: { data: null, loading: false },
    ...initial,
  };
}

export function submissionUiReducer(
  state: SubmissionUiState,
  action: SubmissionUiAction,
): SubmissionUiState {
  return action.type === "update" ? action.updater(state) : state;
}
