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
  isAppealDialogOpen: boolean;
  appealReason: string;
  isAppealSubmitting: boolean;
  isSubmitted: boolean;
  hasAttemptedSubmit: boolean;
  shakeForm: boolean;
  submittedReportId: string | null;
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
    isAppealDialogOpen: false,
    appealReason: "超过 72 小时，需要补交数据",
    isAppealSubmitting: false,
    isSubmitted: false,
    hasAttemptedSubmit: false,
    shakeForm: false,
    submittedReportId: null,
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
