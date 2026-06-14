import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { YikeActor, YikeApiError, YikeApiErrorCode } from "@/lib/yike/types";

const STATUS_BY_CODE: Record<YikeApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function jsonYikeError(error: YikeApiError) {
  return NextResponse.json({ error }, { status: STATUS_BY_CODE[error.code] });
}

export function jsonBadRequest(message = "请求体不是合法 JSON") {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message } },
    { status: 400 },
  );
}

export function jsonInternalError(error: unknown, fallback = "一刻服务异常") {
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : fallback,
      },
    },
    { status: 500 },
  );
}

export async function requireYikeActor(): Promise<
  | { ok: true; actor: YikeActor }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "未登录" } },
        { status: 401 },
      ),
    };
  }

  return { ok: true, actor: { userId: user.id } };
}

export async function readJsonBody(request: NextRequest) {
  try {
    return { ok: true as const, body: await request.json() };
  } catch {
    return { ok: false as const, response: jsonBadRequest() };
  }
}

export function parseYikeDate(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("date");
  if (!value) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function isAuthorizedCronRequest(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-cron-secret");
  return Boolean(secret && (secret === process.env.CRON_SECRET || secret === process.env.REMIND_SECRET));
}
