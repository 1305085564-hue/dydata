export type DraftStatus = "pending" | "approved" | "rejected";

export type PublishDraftBusinessRole = "owner" | "team_admin" | "group_leader" | "member";

export type FeedbackHistoryItem = {
  round: number;
  action: "approve" | "reject";
  reviewer_id: string;
  reviewer_name?: string;
  feedback_text: string | null;
  at: string;
};

export type PublishDraft = {
  id: string;
  submitted_by: string;
  account_id: string | null;
  account_name_snapshot: string | null;
  team_id: string | null;
  script_text: string;
  screenshot_paths: string[];
  status: DraftStatus;
  current_round: number;
  feedback_history: FeedbackHistoryItem[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ReviewQueueItem = {
  id: string;
  script_text: string;
  screenshot_paths: string[];
  account_id: string | null;
  account_name_snapshot: string | null;
  current_round: number;
  feedback_history: FeedbackHistoryItem[];
  created_at: string;
  updated_at: string;
  submitted_by_name: string;
  submitted_by: string;
};

export type ApprovedDraftItem = {
  id: string;
  script_text: string;
  screenshot_paths: string[];
  account_id: string | null;
  account_name_snapshot: string | null;
  approved_at: string | null;
  submitted_by_name: string;
  submitted_by: string;
};

export type PublishDraftActorScope = {
  can_review: boolean;
  business_role: PublishDraftBusinessRole;
  visible_user_ids: string[];
};

const DRAFT_STATUS_SET = new Set<DraftStatus>(["pending", "approved", "rejected"]);
const BUSINESS_ROLE_SET = new Set<PublishDraftBusinessRole>([
  "owner",
  "team_admin",
  "group_leader",
  "member",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown) {
  return value == null ? null : typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isDraftStatus(value: unknown): value is DraftStatus {
  return typeof value === "string" && DRAFT_STATUS_SET.has(value as DraftStatus);
}

export function parseFeedbackHistory(value: unknown): FeedbackHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];

    const round = asNumber(item.round);
    const action = item.action === "approve" || item.action === "reject" ? item.action : null;
    const reviewerId = asString(item.reviewer_id);
    const at = asString(item.at);
    const feedbackText = item.feedback_text == null || typeof item.feedback_text === "string"
      ? (item.feedback_text as string | null)
      : null;
    const reviewerName = typeof item.reviewer_name === "string" && item.reviewer_name.trim()
      ? item.reviewer_name.trim()
      : undefined;

    if (round == null || action == null || !reviewerId || !at) {
      return [];
    }

    return [{
      round,
      action,
      reviewer_id: reviewerId,
      ...(reviewerName ? { reviewer_name: reviewerName } : {}),
      feedback_text: feedbackText,
      at,
    }];
  });
}

export function parsePublishDraftActorScope(value: unknown): PublishDraftActorScope | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return null;

  const canReview = asBoolean(row.can_review);
  const businessRole = typeof row.business_role === "string" && BUSINESS_ROLE_SET.has(row.business_role as PublishDraftBusinessRole)
    ? row.business_role as PublishDraftBusinessRole
    : null;

  if (canReview == null || !businessRole) return null;

  return {
    can_review: canReview,
    business_role: businessRole,
    visible_user_ids: asStringArray(row.visible_user_ids),
  };
}

export function parsePublishDraft(value: unknown): PublishDraft | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const submittedBy = asString(value.submitted_by);
  const scriptText = asString(value.script_text);
  const status = isDraftStatus(value.status) ? value.status : null;
  const currentRound = asNumber(value.current_round);
  const isDeleted = asBoolean(value.is_deleted);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);

  if (!id || !submittedBy || !scriptText || !status || currentRound == null || isDeleted == null || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    submitted_by: submittedBy,
    account_id: asNullableString(value.account_id),
    account_name_snapshot: asNullableString(value.account_name_snapshot),
    team_id: asNullableString(value.team_id),
    script_text: scriptText,
    screenshot_paths: asStringArray(value.screenshot_paths),
    status,
    current_round: currentRound,
    feedback_history: parseFeedbackHistory(value.feedback_history),
    reviewed_by: asNullableString(value.reviewed_by),
    reviewed_at: asNullableString(value.reviewed_at),
    approved_at: asNullableString(value.approved_at),
    is_deleted: isDeleted,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function parseReviewQueueItem(value: unknown): ReviewQueueItem | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const scriptText = asString(value.script_text);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  const submittedByName = asString(value.submitted_by_name);
  const submittedBy = asString(value.submitted_by);
  const currentRound = asNumber(value.current_round);

  if (!id || !scriptText || !createdAt || !updatedAt || !submittedByName || !submittedBy || currentRound == null) {
    return null;
  }

  return {
    id,
    script_text: scriptText,
    screenshot_paths: asStringArray(value.screenshot_paths),
    account_id: asNullableString(value.account_id),
    account_name_snapshot: asNullableString(value.account_name_snapshot),
    current_round: currentRound,
    feedback_history: parseFeedbackHistory(value.feedback_history),
    created_at: createdAt,
    updated_at: updatedAt,
    submitted_by_name: submittedByName,
    submitted_by: submittedBy,
  };
}

export function parseApprovedDraftItem(value: unknown): ApprovedDraftItem | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const scriptText = asString(value.script_text);
  const submittedByName = asString(value.submitted_by_name);
  const submittedBy = asString(value.submitted_by);

  if (!id || !scriptText || !submittedByName || !submittedBy) {
    return null;
  }

  return {
    id,
    script_text: scriptText,
    screenshot_paths: asStringArray(value.screenshot_paths),
    account_id: asNullableString(value.account_id),
    account_name_snapshot: asNullableString(value.account_name_snapshot),
    approved_at: asNullableString(value.approved_at),
    submitted_by_name: submittedByName,
    submitted_by: submittedBy,
  };
}
