import type { ExemptionProfileLike } from "./豁免";

export type LegacyGrantMode = "single" | "3days" | "4days" | "5days";
export type GrantMode = "yesterday" | "range" | "permanent";
export type AnyGrantMode = GrantMode | LegacyGrantMode;
export type ReviewDecision = "approved" | "rejected";

interface BuildGrantDraftInput {
  userId: string;
  teamId: string | null;
  mode: AnyGrantMode;
  reason?: string | null;
  requestId: string | null;
  today: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface BuildRequestDraftInput {
  applicantUserId: string;
  teamId: string | null;
  mode: GrantMode;
  reason?: string | null;
  today: string;
  startDate?: string;
  endDate?: string;
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
  grant_type: AnyGrantMode;
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

export function normalizeGrantMode(mode: AnyGrantMode): GrantMode {
  if (mode === "single") return "yesterday";
  if (mode === "3days" || mode === "4days" || mode === "5days") return "range";
  return mode;
}

function resolveLegacyRange(mode: LegacyGrantMode, today: string) {
  if (mode === "single") {
    const yesterday = addDays(today, -1);
    return { startDate: yesterday, endDate: yesterday };
  }

  if (mode === "3days") {
    return { startDate: today, endDate: addDays(today, 2) };
  }

  if (mode === "4days") {
    return { startDate: today, endDate: addDays(today, 3) };
  }

  return { startDate: today, endDate: addDays(today, 4) };
}

function resolveDateRange(input: BuildGrantDraftInput | BuildRequestDraftInput) {
  const normalizedMode = normalizeGrantMode(input.mode);

  if (normalizedMode === "permanent") {
    return { mode: normalizedMode, startDate: input.today, endDate: null as string | null };
  }

  if (input.mode === "single" || input.mode === "3days" || input.mode === "4days" || input.mode === "5days") {
    const { startDate, endDate } = resolveLegacyRange(input.mode, input.today);
    return { mode: normalizedMode, startDate, endDate };
  }

  if (normalizedMode === "yesterday") {
    const yesterday = addDays(input.today, -1);
    return { mode: normalizedMode, startDate: yesterday, endDate: yesterday };
  }

  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;

  if (!startDate || !endDate) {
    throw new Error("多日豁免必须填写开始和结束日期");
  }

  if (startDate > endDate) {
    throw new Error("开始日期不能晚于结束日期");
  }

  const days = Math.floor((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86400000) + 1;
  if (days < 1) {
      throw new Error("豁免至少选择1天");
    }

  return { mode: normalizedMode, startDate, endDate };
}

export function buildGrantDraft(input: BuildGrantDraftInput): {
  grant: ExemptionGrantDraft;
  profile: ExemptionProfileLike;
} {
  const reason = normalizeReason(input.reason);
  const { mode, startDate, endDate } = resolveDateRange(input);

  if (mode === "permanent" && !reason) {
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
      status: mode === "permanent" ? "exempt" : "active",
      exempt_type: mode === "permanent" ? "permanent" : "temporary",
      exempt_start_date: mode === "permanent" ? null : startDate,
      exempt_end_date: mode === "permanent" ? null : endDate,
      exempt_reason: reason,
    },
  };
}

export function buildRequestDraft(input: BuildRequestDraftInput): ExemptionRequestDraft {
  const { mode, startDate, endDate } = resolveDateRange(input);

  return {
    applicant_user_id: input.applicantUserId,
    team_id: input.teamId,
    exemption_type: mode,
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
