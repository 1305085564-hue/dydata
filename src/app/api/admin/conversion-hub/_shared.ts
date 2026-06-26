import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export function getWeekStartDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function parseWeekStart(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("week_start");
  if (!value) return getWeekStartDate();
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function parseLimitParam(request: NextRequest, fallback = 50) {
  const value = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(value, 100));
}

export function parseBucket(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("bucket")?.trim() || null;
  if (!value) return null;
  return ["promote", "test", "deprecate", "ban"].includes(value) ? value : undefined;
}

export async function requireAdminServiceClient() {
  const auth = await requireAdminActor({ requiredPermission: "manage_violations" });
  if ("error" in auth) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  return { supabase: createAdminClient(), actor: auth.actor };
}

export function jsonBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unwrapRpc<T>(result: RpcResult<T>, fallbackMessage: string) {
  if (result.error) {
    return {
      response: NextResponse.json(
        { error: result.error.message || fallbackMessage },
        { status: 500 },
      ),
    };
  }

  return { data: result.data as T };
}
