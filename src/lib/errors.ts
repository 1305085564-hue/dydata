import { requestContextLogFields, type RequestContext } from "./request-context";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "APPEAL_NOT_FOUND"
  | "APPEAL_OUT_OF_SCOPE"
  | "RPC_FAILED"
  | "AUDIT_FAILED"
  | "EMPLOYEE_NOTIFICATION_FAILED"
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
    this.publicMessage = input.publicMessage ?? publicMessageForCode(input.code);
    this.operation = input.operation;
    this.targetId = input.targetId;
  }
}

const PUBLIC_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "请先登录",
  FORBIDDEN: "无权限执行此操作",
  INVALID_INPUT: "请求参数不正确",
  NOT_FOUND: "请求的内容不存在",
  APPEAL_NOT_FOUND: "补交申请不存在",
  APPEAL_OUT_OF_SCOPE: "不能操作当前管理范围外的申请",
  RPC_FAILED: "补交申请处理失败，请稍后重试",
  AUDIT_FAILED: "申请已处理，但审计留痕失败，请人工核对",
  EMPLOYEE_NOTIFICATION_FAILED: "申请已处理，但结果通知发送失败，请稍后补偿",
  CONFLICT: "当前状态已发生变化，请刷新后重试",
  TIMEOUT: "请求超时，请稍后重试",
  DEPENDENCY_FAILED: "依赖服务暂时不可用，请稍后重试",
  INTERNAL_ERROR: "请求处理失败",
};

export function publicMessageForCode(code: AppErrorCode) {
  return PUBLIC_MESSAGES[code];
}

function statusForCode(code: AppErrorCode) {
  switch (code) {
    case "UNAUTHENTICATED": return 401;
    case "FORBIDDEN": return 403;
    case "INVALID_INPUT": return 400;
    case "NOT_FOUND":
    case "APPEAL_NOT_FOUND": return 404;
    case "APPEAL_OUT_OF_SCOPE": return 403;
    case "RPC_FAILED":
    case "AUDIT_FAILED":
    case "EMPLOYEE_NOTIFICATION_FAILED": return 500;
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
