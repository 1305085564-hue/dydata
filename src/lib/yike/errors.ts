import type { YikeApiError, YikeApiErrorCode } from "./types";

export class YikeServiceError extends Error {
  readonly code: YikeApiErrorCode;
  readonly details: unknown;

  constructor(error: YikeApiError) {
    super(error.message);
    this.name = "YikeServiceError";
    this.code = error.code;
    this.details = error.details;
  }
}

export function yikeError(
  code: YikeApiErrorCode,
  message: string,
  details?: unknown,
): YikeApiError {
  return details === undefined ? { code, message } : { code, message, details };
}
