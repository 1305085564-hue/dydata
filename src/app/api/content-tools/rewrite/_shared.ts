import { NextRequest, NextResponse } from "next/server";

import { toBoolean, toTrimmedString } from "@/lib/type-guards";

export { toBoolean, toTrimmedString };

function normalizeRewriteApiErrorMessage(message: string) {
  const missingRewriteTableOrColumn =
    message.includes("Could not find the table 'public.rewrite_") ||
    message.includes('relation "public.rewrite_') ||
    (message.includes("Could not find the '") && message.includes("' column of 'rewrite_"));
  const missing047Columns =
    (message.includes("output_token_limit") || message.includes("context_message_limit")) &&
    (message.includes("ai_feature_config") ||
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("Could not find the '"));
  const missingV2SchemaVersion =
    message.includes("schema_version") &&
    (message.includes("column") && message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find the '"));
  const missingV2Tables =
    (message.includes("rewrite_documents") ||
      message.includes("rewrite_skills") ||
      message.includes("rewrite_skill_versions") ||
      message.includes("ai_providers") ||
      message.includes("ai_provider_keys")) &&
    (message.includes("relation") && message.includes("does not exist") ||
      message.includes("Could not find the table") ||
      message.includes("schema cache"));

  if (missingV2SchemaVersion || missingV2Tables) {
    return "文案助手 v2 数据表未就绪，请先执行对应 migration";
  }

  if (
    missingRewriteTableOrColumn ||
    missing047Columns
  ) {
    return "文案改写数据表未就绪，请先执行 044 / 045 / 046 / 047 migration";
  }

  if (message.includes("invalid input syntax for type uuid")) {
    return "会话 ID 格式不正确";
  }

  return message;
}

export function toNullableString(value: unknown) {
  const text = toTrimmedString(value);
  return text || null;
}

export function toOptionalNullableString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return toNullableString(value);
}

export async function parseJsonBody<T extends Record<string, unknown>>(request: NextRequest) {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("请求体格式不正确");
  }
}

export function toPositiveInt(value: string | null, fallback: number, max = 100) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function toApiErrorStatus(message: string) {
  if (message.includes("数据表未就绪") || message.includes("schema cache")) return 503;
  if (message === "会话不存在") return 404;
  if (message.includes("未登录")) return 401;
  if (message.includes("无权限") || message.includes("用户信息不存在")) return 403;
  if (message.includes("服务端 Supabase 配置缺失")) return 503;
  if (message.includes("已关闭") || message.includes("未配置") || message.includes("未启用")) return 503;
  if (message.includes("缺少") || message.includes("不存在") || message.includes("格式不正确")) return 400;
  return 500;
}

export function toApiErrorResponse(error: unknown, fallback = "请求失败") {
  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === "string" && error.trim()
        ? error.trim()
        : fallback;
  const message = normalizeRewriteApiErrorMessage(rawMessage);

  return NextResponse.json({ error: message }, { status: toApiErrorStatus(message) });
}
