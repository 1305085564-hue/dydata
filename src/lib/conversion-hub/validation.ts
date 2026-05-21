import { createHash } from "node:crypto";

import {
  APPEAL_STATUSES,
  SCRIPT_FORMATS,
  SCRIPT_USAGE_SOURCES,
  VIOLATION_EVENT_TYPES,
  type AppealStatus,
  type ScriptFormat,
  type ScriptUsageSource,
  type ViolationEventType,
} from "./types";
import { isScriptResultFlag, type ScriptResultFlag } from "@/lib/case-library/shared";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type CreateUsageRecordPayload = {
  case_id: string | null;
  script_text: string | null;
  script_format: ScriptFormat;
  account_id: string | null;
  used_at: string;
  views: number;
  follows: number;
  source: ScriptUsageSource;
  daily_report_id: string | null;
  note: string | null;
  result_flag?: ScriptResultFlag | null;
};

export type CreateViolationEventPayload = {
  case_id: string | null;
  account_id: string;
  event_type: ViolationEventType;
  occurred_at: string;
  platform_notice: string | null;
  screenshot_paths: string[];
  suspected_reason: string | null;
  appeal_status: AppealStatus;
  appeal_result: string | null;
  recovered_at: string | null;
  note: string | null;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOptionalText(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeRequiredUuid(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    return { ok: false, message: `${field} 不合法` };
  }

  return { ok: true, data: value.trim() };
}

function normalizeOptionalUuid(value: unknown, field: string): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, data: null };
  }

  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    return { ok: false, message: `${field} 不合法` };
  }

  return { ok: true, data: value.trim() };
}

function normalizeNonNegativeInteger(value: unknown, field: string): ValidationResult<number> {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ok: false, message: `${field} 必须是大于等于 0 的数字` };
  }

  return { ok: true, data: Math.round(numeric) };
}

function normalizeDateOnly(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value.trim())) {
    return { ok: false, message: `${field} 必须是 YYYY-MM-DD` };
  }

  return { ok: true, data: value.trim() };
}

function normalizeDateTime(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: `${field} 为必填项` };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: `${field} 不是合法时间` };
  }

  return { ok: true, data: date.toISOString() };
}

function normalizeOptionalDateTime(value: unknown, field: string): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, data: null };
  }

  return normalizeDateTime(value, field);
}

function normalizeScreenshotPaths(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !item.includes("..") && !item.startsWith("/"))
        .map((item) => item.slice(0, 300)),
    ),
  ).slice(0, 8);
}

function isScriptFormat(value: unknown): value is ScriptFormat {
  return typeof value === "string" && SCRIPT_FORMATS.includes(value as ScriptFormat);
}

function isUsageSource(value: unknown): value is ScriptUsageSource {
  return typeof value === "string" && SCRIPT_USAGE_SOURCES.includes(value as ScriptUsageSource);
}

function isViolationEventType(value: unknown): value is ViolationEventType {
  return typeof value === "string" && VIOLATION_EVENT_TYPES.includes(value as ViolationEventType);
}

function isAppealStatus(value: unknown): value is AppealStatus {
  return typeof value === "string" && APPEAL_STATUSES.includes(value as AppealStatus);
}

export function buildScriptHash(scriptText: string) {
  return createHash("md5").update(scriptText.trim().toLowerCase()).digest("hex");
}

export function validateCreateUsageRecordPayload(
  body: unknown,
): ValidationResult<CreateUsageRecordPayload> {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const caseId = normalizeOptionalUuid(body.case_id, "case_id");
  if (!caseId.ok) return caseId;

  const accountId = normalizeOptionalUuid(body.account_id, "account_id");
  if (!accountId.ok) return accountId;

  const dailyReportId = normalizeOptionalUuid(body.daily_report_id, "daily_report_id");
  if (!dailyReportId.ok) return dailyReportId;

  const scriptText = normalizeOptionalText(body.script_text, 10000);
  if (!caseId.data && !scriptText) {
    return { ok: false, message: "case_id 或 script_text 至少提供一个" };
  }

  const usedAt = normalizeDateOnly(body.used_at, "used_at");
  if (!usedAt.ok) return usedAt;

  const views = normalizeNonNegativeInteger(body.views, "views");
  if (!views.ok) return views;

  const follows = normalizeNonNegativeInteger(body.follows, "follows");
  if (!follows.ok) return follows;

  if (follows.data > views.data) {
    return { ok: false, message: "follows 不能大于 views" };
  }

  if (
    body.result_flag !== undefined
    && body.result_flag !== null
    && !isScriptResultFlag(body.result_flag)
  ) {
    return { ok: false, message: "result_flag 不合法" };
  }

  return {
    ok: true,
    data: {
      case_id: caseId.data,
      script_text: scriptText,
      script_format: isScriptFormat(body.script_format) ? body.script_format : "oral",
      account_id: accountId.data,
      used_at: usedAt.data,
      views: views.data,
      follows: follows.data,
      source: isUsageSource(body.source) ? body.source : "manual",
      daily_report_id: dailyReportId.data,
      note: normalizeOptionalText(body.note, 1000),
      result_flag: isScriptResultFlag(body.result_flag) ? body.result_flag : null,
    },
  };
}

export function validateCreateViolationEventPayload(
  body: unknown,
): ValidationResult<CreateViolationEventPayload> {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const accountId = normalizeRequiredUuid(body.account_id, "account_id");
  if (!accountId.ok) return accountId;

  const caseId = normalizeOptionalUuid(body.case_id, "case_id");
  if (!caseId.ok) return caseId;

  if (!isViolationEventType(body.event_type)) {
    return { ok: false, message: "event_type 不合法" };
  }

  const occurredAt = normalizeDateTime(body.occurred_at, "occurred_at");
  if (!occurredAt.ok) return occurredAt;

  const recoveredAt = normalizeOptionalDateTime(body.recovered_at, "recovered_at");
  if (!recoveredAt.ok) return recoveredAt;

  return {
    ok: true,
    data: {
      account_id: accountId.data,
      case_id: caseId.data,
      event_type: body.event_type,
      occurred_at: occurredAt.data,
      platform_notice: normalizeOptionalText(body.platform_notice, 5000),
      screenshot_paths: normalizeScreenshotPaths(body.screenshot_paths),
      suspected_reason: normalizeOptionalText(body.suspected_reason, 1000),
      appeal_status: isAppealStatus(body.appeal_status) ? body.appeal_status : "未申诉",
      appeal_result: normalizeOptionalText(body.appeal_result, 2000),
      recovered_at: recoveredAt.data,
      note: normalizeOptionalText(body.note, 1000),
    },
  };
}
