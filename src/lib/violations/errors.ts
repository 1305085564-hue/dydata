export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  } | string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!isPlainObject(payload)) return fallback;
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error;
  if (isPlainObject(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
