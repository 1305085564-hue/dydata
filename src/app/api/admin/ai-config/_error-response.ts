import { NextResponse } from "next/server";

import { logApiError } from "@/lib/api-logger";
import { errorCodeForStatus, toStringErrorResponse } from "@/lib/errors";
import {
  createRequestContext,
  requestContextHeaders,
  requestContextLogFields,
} from "@/lib/request-context";

type StructuredError = Error & {
  status?: number;
  isPublic?: boolean;
  requiresConfirmation?: boolean;
  affectedBusinesses?: unknown[];
  sharedAddressImpact?: unknown;
  unknownReasons?: string[];
};

const RAW_LEAK_PATTERN =
  /relation\s|column\s|syntax error|PGRST\d*|duplicate key|violates\s|permission denied|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|invalid input syntax|simulated\s|database|postgres|supabase|HTTP\s+\d{3}\s*[:：]|raw=|sqlstate|expected one row|stack\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|timeout\s+exceeded/i;

const CJK_PATTERN = /[\u4e00-\u9fff]/;

export function isSafePublicChineseMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 240) return false;
  if (!CJK_PATTERN.test(trimmed)) return false;
  if (RAW_LEAK_PATTERN.test(trimmed)) return false;
  return true;
}

export function toSafeAiConfigErrorResponse(input: {
  error: unknown;
  fallbackMessage: string;
  route: string;
  operation: string;
  request?: Request;
  requestId?: string | null;
  defaultStatus?: number;
}) {
  const cause = input.error as StructuredError | null | undefined;
  const rawStatus = typeof cause?.status === "number" ? cause.status : undefined;
  const hasConfirmationPayload =
    typeof cause?.requiresConfirmation === "boolean"
    || Boolean(cause?.sharedAddressImpact)
    || Array.isArray(cause?.unknownReasons);
  const rawMessage = input.error instanceof Error ? input.error.message.trim() : "";

  const extraFields: Record<string, unknown> = {
    ...(typeof cause?.requiresConfirmation === "boolean" ? { requiresConfirmation: cause.requiresConfirmation } : {}),
    ...(Array.isArray(cause?.affectedBusinesses) ? { affectedBusinesses: cause.affectedBusinesses } : {}),
    ...(cause?.sharedAddressImpact ? { sharedAddressImpact: cause.sharedAddressImpact } : {}),
    ...(Array.isArray(cause?.unknownReasons) ? { unknownReasons: cause.unknownReasons } : {}),
  };

  const canExposeMessage =
    (hasConfirmationPayload && rawMessage.length > 0 && isSafePublicChineseMessage(rawMessage))
    || (cause?.isPublic === true && isSafePublicChineseMessage(rawMessage))
    || (
      rawStatus !== undefined
      && rawStatus >= 400
      && rawStatus < 500
      && isSafePublicChineseMessage(rawMessage)
    );

  if (canExposeMessage) {
    const status = rawStatus ?? (hasConfirmationPayload ? 409 : 400);
    const context = createRequestContext({
      request: input.request,
      requestId: input.requestId,
      route: input.route,
      operation: input.operation,
    });
    logApiError(
      {
        ...requestContextLogFields(context),
        status,
        outcome: status >= 500 ? "failed" : "rejected",
        detail: { code: errorCodeForStatus(status), publicError: true },
      },
      rawMessage,
    );
    return NextResponse.json(
      {
        error: rawMessage,
        requestId: context.requestId,
        ...extraFields,
      },
      {
        status,
        headers: { [requestContextHeaders.requestId]: context.requestId },
      },
    );
  }

  const status = rawStatus && rawStatus >= 500 ? rawStatus : (input.defaultStatus ?? 500);
  const safeFallback =
    rawStatus === 502 && rawMessage.includes("Clairic 鉴权失败")
      ? "Cloudflare Clairic 鉴权失败，请检查接口地址和 API Token（需 Workers AI 权限）"
      : rawStatus === 502 && rawMessage.includes("上游未返回可用模型")
        ? "探测模型列表失败：上游未返回可用模型"
        : rawStatus === 502 && rawMessage.includes("上游返回不是有效 JSON")
          ? "探测模型列表失败：上游返回不是有效 JSON"
          : rawStatus === 502 && rawMessage.includes("渠道 URL 或 API Key 缺失")
            ? "探测模型列表失败：渠道 URL 或 API Key 缺失"
            : rawStatus === 502 && rawMessage.includes("探测 Clairic 失败")
              ? "探测 Cloudflare Clairic 失败，请检查接口地址与 API Token"
              : rawStatus === 502
                ? "探测模型列表失败，请检查接入点和 API Key"
                : input.fallbackMessage;

  return toStringErrorResponse({
    code: errorCodeForStatus(status),
    route: input.route,
    operation: input.operation,
    request: input.request,
    requestId: input.requestId,
    error: input.error,
    status,
    message: safeFallback,
    extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
  });
}
