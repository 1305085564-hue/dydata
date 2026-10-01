import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

export const VIDEO_SUBMIT_GRACE_HOURS = 72;

export type VideoSubmitDeadlineMode = "create" | "edit";
export type VideoSubmitDeadlineDecision =
  | "allow"
  | "requires_appeal"
  | "requires_confirmation"
  | "invalid";

export type VideoSubmitDeadlineResult = {
  decision: VideoSubmitDeadlineDecision;
  reason:
    | "edit"
    | "within_window"
    | "expired"
    | "missing_published_at"
    | "invalid_published_at"
    | "unconfirmed_published_at";
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
  /**
   * Whether the publish time is a real, confirmed value (recognized by OCR or
   * explicitly entered by the user). When false, the payload's publish time is
   * the silent fallback default and must NOT be trusted to grant a normal pass.
   */
  publishedAtConfirmed?: boolean;
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

  // The only late-submission gate is the real elapsed time since publication.
  // Crossing a calendar month does not add a second approval requirement.
  if (input.publishedAtConfirmed === false) {
    return {
      decision: "requires_confirmation",
      reason: "unconfirmed_published_at",
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

/**
 * Whether the publish time is a real, confirmed value (recognized by OCR or
 * explicitly entered by the user) instead of the silent fallback default.
 *
 * Single source of truth: the submit route's deadline guard and the client's
 * submission-readiness check both call this, so they can never drift apart.
 */
export function isPublishedAtConfirmed(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}
