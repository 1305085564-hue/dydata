import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export function parseDateParam(request: NextRequest, key = "date") {
  const value = request.nextUrl.searchParams.get(key);
  if (!value) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function parseLimitParam(request: NextRequest, fallback = 20) {
  const value = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(value, 100));
}

export async function requireAdminServiceClient() {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  return { supabase: createAdminClient(), actor: auth.actor };
}

export function jsonBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function jsonRpcError(message = "后台数据读取失败") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function unwrapRpc<T>(result: RpcResult<T>, fallbackMessage?: string) {
  if (result.error) {
    return { response: jsonRpcError(result.error.message || fallbackMessage) };
  }

  return { data: result.data as T };
}
