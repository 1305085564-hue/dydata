import { NextRequest, NextResponse } from "next/server";

import { toBoolean, toTrimmedString } from "@/lib/type-guards";

export { toBoolean, toTrimmedString };

function normalizeRewriteApiErrorMessage(message: string) {
  if (
    message.includes("Could not find the table 'public.rewrite_") ||
    message.includes('relation "public.rewrite_') ||
    (message.includes("Could not find the '") && message.includes("' column of 'rewrite_"))
  ) {
    return "文案改写数据表未就绪，请先执行 044 / 045 migration";
  }

  return message;
}

export function toNullableString(value: unknown) {
  const text = toTrimmedString(value);
  return text || null;
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
