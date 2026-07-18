import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { BusinessRole } from "@/lib/business-role";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function jsonBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJsonBody(request: Request) {
  try {
    return { data: await request.json() };
  } catch {
    return { response: jsonBadRequest("请求体不是合法 JSON") };
  }
}

export async function requireSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }

  return { supabase, user };
}

export async function requireOwnerOrAdminActor() {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  if (!isProductionManagerBusinessRole(auth.actor.businessRole)) {
    return { response: NextResponse.json({ error: "无权限" }, { status: 403 }) };
  }

  const permissionContext = await buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return { response: NextResponse.json({ error: "用户信息不存在" }, { status: 403 }) };
  }

  return {
    supabase: createAdminClient(),
    actor: auth.actor,
    scope: permissionContext.scope,
  };
}

export function isProductionManagerBusinessRole(businessRole: BusinessRole) {
  return businessRole === "owner" || businessRole === "team_admin" || businessRole === "group_leader";
}

export function requireGlobalProductionActor(
  auth: Awaited<ReturnType<typeof requireOwnerOrAdminActor>>,
) {
  if ("response" in auth) return auth.response;
  if (auth.actor.businessRole !== "owner" && auth.actor.businessRole !== "team_admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return null;
}

export function requireVisibleProductionUser(
  auth: Awaited<ReturnType<typeof requireOwnerOrAdminActor>>,
  userId: string | null | undefined,
) {
  if ("response" in auth) return auth.response;
  if (auth.scope.kind === "all") return null;
  if (!userId || !auth.scope.visibleUserIds.includes(userId)) {
    return NextResponse.json({ error: "不能操作当前管理范围外的成员" }, { status: 403 });
  }
  return null;
}

export function toTrimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function parseOptionalDate(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { error: "日期必须是 YYYY-MM-DD" };
  const trimmed = value.trim();
  if (!isValidDate(trimmed)) return { error: "日期必须是 YYYY-MM-DD" };
  return { value: trimmed };
}

export function getShanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseLimit(value: string | null, fallback = 50, max = 200) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

export function escapeCsvCell(value: unknown) {
  const rawText = value == null ? "" : String(value);
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
