import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export const VIDEO_SUBMIT_GRACE_HOURS = 72;

export type VideoSubmitDeadlineMode = "create" | "edit";
export type VideoSubmitDeadlineDecision = "allow" | "requires_appeal" | "invalid";

export type VideoSubmitDeadlineResult = {
  decision: VideoSubmitDeadlineDecision;
  reason: "edit" | "within_window" | "cross_month" | "expired" | "missing_published_at" | "invalid_published_at";
  publishedDate: string | null;
  elapsedHours: number | null;
};

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const shanghaiValue = hasTimezone
    ? trimmed
    : `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+08:00`;
  const date = new Date(shanghaiValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * First-create deadline policy. Historical edits deliberately bypass the
 * deadline so existing records remain editable.
 */
export function resolveVideoSubmitDeadline(input: {
  mode: VideoSubmitDeadlineMode;
  publishedAt: string | Date | null | undefined;
  uploadedAt?: string | Date | null;
  businessDate: string;
}): VideoSubmitDeadlineResult {
  const publishedAt = parseDate(input.publishedAt);
  const publishedDate = publishedAt ? formatShanghaiDateOnly(publishedAt) : null;

  if (input.mode === "edit") {
    return {
      decision: "allow",
      reason: "edit",
      publishedDate,
      elapsedHours: null,
    };
  }

  if (!input.publishedAt) {
    return {
      decision: "invalid",
      reason: "missing_published_at",
      publishedDate: null,
      elapsedHours: null,
    };
  }

  if (!publishedAt || !publishedDate) {
    return {
      decision: "invalid",
      reason: "invalid_published_at",
      publishedDate: null,
      elapsedHours: null,
    };
  }

  const uploadedAt = parseDate(input.uploadedAt) ?? new Date();
  const elapsedHours = (uploadedAt.getTime() - publishedAt.getTime()) / 3_600_000;

  if (elapsedHours < 0) {
    return {
      decision: "invalid",
      reason: "invalid_published_at",
      publishedDate,
      elapsedHours,
    };
  }

  const uploadedDate = formatShanghaiDateOnly(uploadedAt);
  if (uploadedDate.slice(0, 7) !== input.businessDate.slice(0, 7)) {
    return {
      decision: "requires_appeal",
      reason: "cross_month",
      publishedDate,
      elapsedHours,
    };
  }

  if (elapsedHours > VIDEO_SUBMIT_GRACE_HOURS) {
    return {
      decision: "requires_appeal",
      reason: "expired",
      publishedDate,
      elapsedHours,
    };
  }

  return {
    decision: "allow",
    reason: "within_window",
    publishedDate,
    elapsedHours,
  };
}
