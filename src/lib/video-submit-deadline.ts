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

/**
 * 把 OCR 返回的发布时间原文（如 `2026-03-05 20:42 发布`、`2026年3月5日 20:42`）
 * 解析成本地时间串 `YYYY-MM-DDTHH:mm`，与客户端的 `toDateTimeLocalValue()` 同格式。
 *
 * 只有日期没有时刻时按当天 00:00 处理：这只会让 72 小时判定更严格（更容易判超期、
 * 多走一次补交审批），不会放行真实已超期的作品。
 */
export function parsePublishedAtText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/[年月]/g, "-")
    .replace(/日/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[．。]/g, ".");
  if (!normalized) return null;

  const match = normalized.match(
    /(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s*[T\s]\s*(\d{1,2})\s*:\s*(\d{1,2}))?/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  // 拒绝 2026-02-31 这类不存在的日期
  const probe = new Date(year, month - 1, day, hour, minute);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** `YYYY-MM-DDTHH:mm` → 可展示的 `YYYY-MM-DD HH:mm`。 */
export function formatPublishedAtText(value: string): string {
  return value.replace("T", " ");
}

/**
 * OCR 识别结果 → 可写入表单的发布时间。
 *
 * 关键约束：只有**真实时间**能确定（ISO 解析成功，或原文能被解析）时才返回结果。
 * 只识别到无法解析的文本时必须返回 null —— 否则 `published_at_text` 会被写入，
 * `isPublishedAtConfirmed()` 判为「已确认」放行，而 72 小时判定实际用的仍是派生
 * 默认时间，等于绕过补交审批。
 */
export function resolveOcrPublishedAt(
  recognizedLocalDateTime: string | null | undefined,
  recognizedText: string | null | undefined,
): { publishedAt: string; publishedAtText: string } | null {
  const iso = recognizedLocalDateTime?.trim() || null;
  const text = recognizedText?.trim() || null;
  const publishedAt = iso ?? parsePublishedAtText(text);
  if (!publishedAt) return null;
  return {
    publishedAt,
    publishedAtText: text ?? formatPublishedAtText(publishedAt),
  };
}
