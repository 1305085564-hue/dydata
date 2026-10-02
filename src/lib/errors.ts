import { requestContextLogFields, type RequestContext } from "./request-context";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TIMEOUT"
  | "DEPENDENCY_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly operation?: string;
  readonly targetId?: string;

  constructor(input: {
    code: AppErrorCode;
    message: string;
    publicMessage?: string;
    status?: number;
    operation?: string;
    targetId?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AppError";
    this.code = input.code;
    this.status = input.status ?? statusForCode(input.code);
    this.publicMessage = input.publicMessage ?? input.message;
    this.operation = input.operation;
    this.targetId = input.targetId;
  }
}

function statusForCode(code: AppErrorCode) {
  switch (code) {
    case "UNAUTHENTICATED": return 401;
    case "FORBIDDEN": return 403;
    case "INVALID_INPUT": return 400;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "TIMEOUT": return 504;
    case "DEPENDENCY_FAILED": return 502;
    default: return 500;
  }
}

export function normalizeAppError(error: unknown, fallback = "请求处理失败") {
  if (error instanceof AppError) return error;
  return new AppError({ code: "INTERNAL_ERROR", message: fallback, publicMessage: fallback, cause: error });
}

export function toErrorResponse(error: unknown, context: RequestContext) {
  const normalized = normalizeAppError(error);
  return Response.json({
    error: {
      code: normalized.code,
      message: normalized.publicMessage,
      requestId: context.requestId,
    },
  }, {
    status: normalized.status,
    headers: { "x-dydata-request-id": context.requestId },
  });
}

export function errorLogFields(error: unknown, context: RequestContext) {
  const normalized = normalizeAppError(error);
  return {
    ...requestContextLogFields(context),
    code: normalized.code,
    status: normalized.status,
    ...(normalized.operation ? { errorOperation: normalized.operation } : {}),
    ...(normalized.targetId ? { errorTargetId: normalized.targetId } : {}),
  };
}
