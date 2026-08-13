import type { SubmitPanelMode } from "./video-submit-panel-state";

export const SUBMISSION_ASSIGNEE_ROLES = ["script_author", "video_editor", "operator"] as const;
export type SubmissionAssigneeRole = (typeof SUBMISSION_ASSIGNEE_ROLES)[number];

export type SubmissionRoleAssignments = {
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
};


function getAssignmentKey(role: SubmissionAssigneeRole): keyof SubmissionRoleAssignments {
  if (role === "script_author") return "scriptAuthorUserId";
  if (role === "video_editor") return "videoEditorUserId";
  return "operatorUserId";
}

export function addRoleOverride({
  userId,
  role,
  assignments,
  overrides,
}: {
  userId: string;
  role: SubmissionAssigneeRole;
  assignments: SubmissionRoleAssignments;
  overrides: SubmissionAssigneeRole[];
}) {
  if (!userId) return { assignments, overrides };
  return {
    assignments,
    overrides: overrides.includes(role) ? overrides : [...overrides, role],
  };
}

export function removeRoleOverride({
  userId,
  role,
  assignments,
  overrides,
}: {
  userId: string;
  role: SubmissionAssigneeRole;
  assignments: SubmissionRoleAssignments;
  overrides: SubmissionAssigneeRole[];
}) {
  return {
    assignments: { ...assignments, [getAssignmentKey(role)]: userId },
    overrides: overrides.filter((item) => item !== role),
  };
}

export function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function setOperatorToSelf(userId: string) {
  return userId;
}

export function setOperatorUser(id: string) {
  return id;
}

export function shouldAutoRedirectToGrowthAfterSubmit({
  mode,
  bizDate,
  today,
  submittedViewActive,
  hasInitialSummary,
}: {
  mode: SubmitPanelMode;
  bizDate: string;
  today: string;
  submittedViewActive: boolean;
  hasInitialSummary: boolean;
}) {
  return mode === "create" && bizDate === today && !submittedViewActive && !hasInitialSummary;
}

export function preserveBizDateWhenPublishedAtChanges(currentBizDate: string) {
  return currentBizDate;
}

export type ScreenshotUploadSlotRole = "screenshot_1" | "screenshot_2";
export type ScreenshotUploadSlotLike = { status: string };

export const SCREENSHOT_UPLOAD_SLOT_ORDER: ScreenshotUploadSlotRole[] = [
  "screenshot_1",
  "screenshot_2",
];

export function findNextScreenshotUploadRole(
  slots: Record<ScreenshotUploadSlotRole, ScreenshotUploadSlotLike>,
  order: ScreenshotUploadSlotRole[] = SCREENSHOT_UPLOAD_SLOT_ORDER,
): ScreenshotUploadSlotRole | null {
  return order.find((role) => {
    const status = slots[role]?.status;
    return status === "empty" || status === "failed";
  }) ?? null;
}
