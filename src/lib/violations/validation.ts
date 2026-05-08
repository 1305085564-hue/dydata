import type { ViolationStatus } from "@/types";

import {
  isPlainObject,
  isViolationCategory,
  isViolationRiskLevel,
  isViolationStatus,
  MAX_SCREENSHOT_COUNT,
  normalizeOptionalText,
  normalizeStringArray,
} from "./api";

export type CreateViolationPayload = {
  script_text: string;
  is_violation: boolean;
  category: string;
  account_id: string | null;
  scene_description: string | null;
  screenshot_paths: string[];
  result: string | null;
  tags: string[];
};

export type CreateViolationValidationResult =
  | { ok: true; data: CreateViolationPayload }
  | { ok: false; message: string; details?: unknown };

export function validateCreateViolationPayload(body: unknown): CreateViolationValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const scriptText = typeof body.script_text === "string" ? body.script_text.trim() : "";
  if (!scriptText) {
    return { ok: false, message: "script_text 为必填项" };
  }

  if (scriptText.length > 10000) {
    return { ok: false, message: "script_text 不能超过 10000 字" };
  }

  if (typeof body.is_violation !== "boolean") {
    return { ok: false, message: "is_violation 必须为布尔值" };
  }

  if (!isViolationCategory(body.category)) {
    return { ok: false, message: "category 不合法" };
  }

  const accountId = typeof body.account_id === "string" && body.account_id.trim()
    ? body.account_id.trim()
    : null;
  const screenshotPaths = normalizeStringArray(body.screenshot_paths, MAX_SCREENSHOT_COUNT, 300);

  return {
    ok: true,
    data: {
      script_text: scriptText,
      is_violation: body.is_violation,
      category: body.category,
      account_id: accountId,
      scene_description: normalizeOptionalText(body.scene_description, 3000),
      screenshot_paths: screenshotPaths,
      result: normalizeOptionalText(body.result, 500),
      tags: normalizeStringArray(body.tags, 10, 30),
    },
  };
}

export type CreateTestRecordPayload = {
  account_id: string | null;
  passed: boolean;
  note: string | null;
};

export type CreateTestRecordValidationResult =
  | { ok: true; data: CreateTestRecordPayload }
  | { ok: false; message: string; details?: unknown };

export function validateCreateTestRecordPayload(body: unknown): CreateTestRecordValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  if (typeof body.passed !== "boolean") {
    return { ok: false, message: "passed 必须为布尔值" };
  }

  const accountId = typeof body.account_id === "string" && body.account_id.trim()
    ? body.account_id.trim()
    : null;

  return {
    ok: true,
    data: {
      account_id: accountId,
      passed: body.passed,
      note: normalizeOptionalText(body.note, 1000),
    },
  };
}

export type ReviewViolationPayload = {
  status: Extract<ViolationStatus, "verified" | "rejected" | "archived">;
  risk_level: "high" | "medium" | "low" | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

export type ReviewViolationValidationResult =
  | { ok: true; data: ReviewViolationPayload }
  | { ok: false; message: string; details?: unknown };

export function validateReviewViolationPayload(body: unknown): ReviewViolationValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  if (!isViolationStatus(body.status) || body.status === "submitted") {
    return { ok: false, message: "status 不合法" };
  }

  const riskLevel: "high" | "medium" | "low" | null =
    body.risk_level === null || body.risk_level === undefined
      ? null
      : isViolationRiskLevel(body.risk_level)
        ? body.risk_level
        : null;

  if (body.risk_level !== null && body.risk_level !== undefined && riskLevel === null) {
    return { ok: false, message: "risk_level 不合法" };
  }

  return {
    ok: true,
    data: {
      status: body.status,
      risk_level: riskLevel,
      admin_conclusion: normalizeOptionalText(body.admin_conclusion, 3000),
      suggested_action: normalizeOptionalText(body.suggested_action, 3000),
    },
  };
}
