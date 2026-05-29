import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { canAccessOwner, type DataAccessScope } from "@/lib/data-access-scope";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
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

  const supabase = createAdminClient();
  const permissionContext = await buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return { response: NextResponse.json({ error: "用户信息不存在" }, { status: 403 }) };
  }

  return {
    supabase,
    actor: auth.actor,
    permissionInfo: permissionContext.permissionInfo,
    scope: permissionContext.scope,
  };
}

export function filterScopedRows<T>(
  scope: DataAccessScope,
  rows: T[] | null | undefined,
  getOwnerUserId: (row: T) => string | null | undefined,
) {
  if (scope.kind === "all") return rows ?? [];
  return (rows ?? []).filter((row) => canAccessOwner(scope, getOwnerUserId(row)));
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
