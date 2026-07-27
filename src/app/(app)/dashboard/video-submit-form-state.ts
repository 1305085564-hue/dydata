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

export function getActiveNonSelfRoles({
  userId,
  ...assignments
}: { userId: string } & SubmissionRoleAssignments): SubmissionAssigneeRole[] {
  return SUBMISSION_ASSIGNEE_ROLES.filter((role) => {
    const assigneeId = assignments[getAssignmentKey(role)];
    return Boolean(assigneeId) && assigneeId !== userId;
  });
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

export function resolveOperatorUserIdForTopic({
  currentOperatorUserId,
  claimantUserId,
  hasManualOperatorSelection,
}: {
  currentOperatorUserId: string | null;
  claimantUserId: string | null | undefined;
  hasManualOperatorSelection: boolean;
}) {
  if (hasManualOperatorSelection || !claimantUserId) return currentOperatorUserId;
  return claimantUserId;
}

export function resolveScriptAuthorUserIdForTopic({
  currentScriptAuthorUserId,
  claimantUserId,
  currentUserId,
  hasManualScriptAuthorSelection,
}: {
  currentScriptAuthorUserId: string | null;
  claimantUserId: string | null | undefined;
  currentUserId: string;
  hasManualScriptAuthorSelection: boolean;
}) {
  if (hasManualScriptAuthorSelection || !claimantUserId || claimantUserId === currentUserId) {
    return currentScriptAuthorUserId;
  }
  return claimantUserId;
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

export function shouldAutoBindNewTopic({
  urlLocked,
  isManuallySet,
  topicId,
}: {
  urlLocked: boolean;
  isManuallySet: boolean;
  topicId: string | null | undefined;
}) {
  if (urlLocked) return false;
  return !(isManuallySet && Boolean(topicId));
}

export function resolveDraftTopicId({
  urlLocked,
  currentTopicId,
  draftTopicId,
}: {
  urlLocked: boolean;
  currentTopicId: string | null | undefined;
  draftTopicId: string | null | undefined;
}) {
  return urlLocked ? (currentTopicId ?? null) : (draftTopicId ?? null);
}

export function resolveDraftManualTopicState({
  urlLocked,
  currentIsManuallySet,
  draftIsManuallySet,
  draftTopicId,
}: {
  urlLocked: boolean;
  currentIsManuallySet: boolean;
  draftIsManuallySet?: boolean;
  draftTopicId: string | null | undefined;
}) {
  if (urlLocked) return currentIsManuallySet;
  return draftIsManuallySet ?? Boolean(draftTopicId);
}

export function shouldAutoSelectSuggestedTopic({
  urlLocked,
  isManuallySet,
  currentTopicId,
}: {
  urlLocked: boolean;
  isManuallySet: boolean;
  currentTopicId: string | null | undefined;
}) {
  return !urlLocked && !isManuallySet && !currentTopicId;
}

export function sanitizeTopicSearchKeyword(value: string) {
  return value.replace(/[%(),"]/g, " ").replace(/\s+/g, " ").trim();
}
