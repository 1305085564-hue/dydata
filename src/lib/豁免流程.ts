import type { ExemptionProfileLike } from "./豁免";

export type GrantMode = "single" | "3days" | "4days" | "5days" | "permanent";
export type ReviewDecision = "approved" | "rejected";

interface BuildGrantDraftInput {
  userId: string;
  teamId: string | null;
  mode: GrantMode;
  reason?: string | null;
  requestId: string | null;
  today: string;
}

interface BuildRequestDraftInput {
  applicantUserId: string;
  teamId: string | null;
  mode: GrantMode;
  reason?: string | null;
  today: string;
}

interface BuildReviewPatchInput {
  reviewerId: string;
  decision: ReviewDecision;
}

interface ExemptionGrantDraft {
  request_id: string | null;
  user_id: string;
  team_id: string | null;
  start_date: string;
  end_date: string | null;
  grant_type: GrantMode;
  status: "active";
}

interface ExemptionRequestDraft {
  applicant_user_id: string;
  team_id: string | null;
  exemption_type: GrantMode;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: "pending";
}

interface ExemptionRequestReviewPatch {
  request_status: ReviewDecision;
  reviewed_by: string;
  reviewed_at: string;
}

function normalizeReason(reason?: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function resolveDateRange(mode: GrantMode, today: string) {
  if (mode === "single") {
    return { startDate: today, endDate: today };
  }

  if (mode === "3days") {
    return { startDate: today, endDate: addDays(today, 2) };
  }

  if (mode === "4days") {
    return { startDate: today, endDate: addDays(today, 3) };
  }

  if (mode === "5days") {
    return { startDate: today, endDate: addDays(today, 4) };
  }

  return { startDate: today, endDate: null };
}

export function buildGrantDraft(input: BuildGrantDraftInput): {
  grant: ExemptionGrantDraft;
  profile: ExemptionProfileLike;
} {
  const reason = normalizeReason(input.reason);
  const { startDate, endDate } = resolveDateRange(input.mode, input.today);

  if (input.mode === "permanent" && !reason) {
    throw new Error("永久豁免必须填写原因");
  }

  return {
    grant: {
      request_id: input.requestId,
      user_id: input.userId,
      team_id: input.teamId,
      start_date: startDate,
      end_date: endDate,
      grant_type: input.mode,
      status: "active",
    },
    profile: {
      id: input.userId,
      status: input.mode === "permanent" ? "exempt" : "active",
      exempt_type: input.mode === "permanent" ? "permanent" : "temporary",
      exempt_start_date: input.mode === "permanent" ? null : startDate,
      exempt_end_date: input.mode === "permanent" ? null : endDate,
      exempt_reason: reason,
    },
  };
}

export function buildRequestDraft(input: BuildRequestDraftInput): ExemptionRequestDraft {
  const { startDate, endDate } = resolveDateRange(input.mode, input.today);

  return {
    applicant_user_id: input.applicantUserId,
    team_id: input.teamId,
    exemption_type: input.mode,
    start_date: startDate,
    end_date: endDate,
    reason: normalizeReason(input.reason),
    request_status: "pending",
  };
}

export function buildReviewPatch(input: BuildReviewPatchInput): ExemptionRequestReviewPatch {
  return {
    request_status: input.decision,
    reviewed_by: input.reviewerId,
    reviewed_at: new Date().toISOString(),
  };
}
