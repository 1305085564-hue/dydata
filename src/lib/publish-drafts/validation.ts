import {
  isPlainObject,
  normalizeStringArray,
} from "./api";

export type CreateDraftPayload = {
  script_text: string;
  screenshot_paths: string[];
  account_id: string | null;
};

export type UpdateDraftPayload = {
  script_text?: string;
  screenshot_paths?: string[];
  account_id?: string | null;
};

export type RejectDraftPayload = {
  feedback_text: string;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: unknown };

function normalizeAccountId(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validateScriptText(value: unknown) {
  if (typeof value !== "string") {
    return { ok: false as const, message: "script_text 为必填项" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false as const, message: "script_text 为必填项" };
  }

  if (trimmed.length > 5000) {
    return { ok: false as const, message: "script_text 不能超过 5000 字" };
  }

  return { ok: true as const, value: trimmed };
}

function validateScreenshotPaths(value: unknown) {
  if (!Array.isArray(value)) {
    return { ok: false as const, message: "screenshot_paths 必须是数组" };
  }

  if (value.length > 5) {
    return { ok: false as const, message: "screenshot_paths 最多 5 张" };
  }

  if (value.some((item) => typeof item !== "string" || !item.trim())) {
    return { ok: false as const, message: "screenshot_paths 只能包含非空字符串" };
  }

  return {
    ok: true as const,
    value: normalizeStringArray(value, 5, 300),
  };
}

export function validateCreateDraftPayload(body: unknown): ValidationResult<CreateDraftPayload> {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const scriptTextResult = validateScriptText(body.script_text);
  if (!scriptTextResult.ok) {
    return { ok: false, message: scriptTextResult.message };
  }

  const screenshotPathsResult = validateScreenshotPaths(body.screenshot_paths ?? []);
  if (!screenshotPathsResult.ok) {
    return { ok: false, message: screenshotPathsResult.message };
  }

  if (body.account_id !== undefined && body.account_id !== null && typeof body.account_id !== "string") {
    return { ok: false, message: "account_id 不合法" };
  }

  return {
    ok: true,
    data: {
      script_text: scriptTextResult.value,
      screenshot_paths: screenshotPathsResult.value,
      account_id: normalizeAccountId(body.account_id),
    },
  };
}

export function validateUpdateDraftPayload(body: unknown): ValidationResult<UpdateDraftPayload> {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  const data: UpdateDraftPayload = {};

  if ("script_text" in body) {
    const scriptTextResult = validateScriptText(body.script_text);
    if (!scriptTextResult.ok) {
      return { ok: false, message: scriptTextResult.message };
    }
    data.script_text = scriptTextResult.value;
  }

  if ("screenshot_paths" in body) {
    const screenshotPathsResult = validateScreenshotPaths(body.screenshot_paths);
    if (!screenshotPathsResult.ok) {
      return { ok: false, message: screenshotPathsResult.message };
    }
    data.screenshot_paths = screenshotPathsResult.value;
  }

  if ("account_id" in body) {
    if (body.account_id !== undefined && body.account_id !== null && typeof body.account_id !== "string") {
      return { ok: false, message: "account_id 不合法" };
    }
    data.account_id = normalizeAccountId(body.account_id);
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, message: "至少提交一个可更新字段" };
  }

  return { ok: true, data };
}

export function validateRejectPayload(body: unknown): ValidationResult<RejectDraftPayload> {
  if (!isPlainObject(body)) {
    return { ok: false, message: "请求体格式不正确" };
  }

  if (typeof body.feedback_text !== "string") {
    return { ok: false, message: "feedback_text 为必填项" };
  }

  const feedbackText = body.feedback_text.trim();
  if (!feedbackText) {
    return { ok: false, message: "feedback_text 为必填项" };
  }

  if (feedbackText.length > 1000) {
    return { ok: false, message: "feedback_text 不能超过 1000 字" };
  }

  return {
    ok: true,
    data: {
      feedback_text: feedbackText,
    },
  };
}
