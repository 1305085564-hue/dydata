import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessGroup,
  type BusinessRole,
} from "@/lib/business-role";
import { hasPermission as hasUnifiedPermission } from "@/lib/permission-utils";
import { createClient } from "@/lib/supabase/server";
import type {
  PermissionKey,
  Permissions,
  UserRole,
  ViolationCategory,
  ViolationRiskLevel,
  ViolationStatus,
} from "@/types";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "SERVER_ERROR";

export const VIOLATION_CATEGORIES: ViolationCategory[] = ["下粉", "直播", "短视频", "其他"];
export const VIOLATION_STATUSES: ViolationStatus[] = ["submitted", "verified", "rejected", "archived"];
export const VIOLATION_RISK_LEVELS: ViolationRiskLevel[] = ["high", "medium", "low"];
export const MAX_SCREENSHOT_COUNT = 5;
export const VIOLATION_SCREENSHOT_BUCKET = "violation-screenshots";
export const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
export const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function jsonError(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function jsonBadRequest(message: string, details?: unknown) {
  return jsonError("BAD_REQUEST", message, 400, details);
}

export function jsonValidationError(message: string, details?: unknown) {
  return jsonError("VALIDATION_ERROR", message, 422, details);
}

export function jsonUnauthorized() {
  return jsonError("UNAUTHORIZED", "未登录", 401);
}

export function jsonForbidden(message = "无权限") {
  return jsonError("FORBIDDEN", message, 403);
}

export function jsonNotFound(message = "记录不存在") {
  return jsonError("NOT_FOUND", message, 404);
}

export function jsonServerError(message = "服务器错误") {
  return jsonError("SERVER_ERROR", message, 500);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOptionalText(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function normalizeStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength));
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

export function isViolationCategory(value: unknown): value is ViolationCategory {
  return typeof value === "string" && VIOLATION_CATEGORIES.includes(value as ViolationCategory);
}

export function isViolationStatus(value: unknown): value is ViolationStatus {
  return typeof value === "string" && VIOLATION_STATUSES.includes(value as ViolationStatus);
}

export function isViolationRiskLevel(value: unknown): value is ViolationRiskLevel {
  return typeof value === "string" && VIOLATION_RISK_LEVELS.includes(value as ViolationRiskLevel);
}

export function hasPermission(role: UserRole, permissions: Permissions, key: PermissionKey) {
  return hasUnifiedPermission(role, permissions, key);
}

export async function getAuthenticatedContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null };
  return { supabase, user };
}

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, permissions, team_id, group_id")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  const { data: ledGroups } = await supabase
    .from("groups")
    .select("id, team_id, leader_user_id")
    .eq("leader_user_id", userId);
  const role = data.role as UserRole;
  const rawPermissions = (data.permissions ?? {}) as Permissions;
  const businessRole = resolveBusinessRole(
    {
      id: data.id as string,
      role,
      permissions: rawPermissions,
      team_id: (data.team_id ?? null) as string | null,
      group_id: (data.group_id ?? null) as string | null,
    },
    (ledGroups ?? []) as BusinessGroup[],
  );

  return {
    id: data.id as string,
    role,
    businessRole,
    permissions: normalizePermissionsForBusinessRole(businessRole, rawPermissions),
    team_id: (data.team_id ?? null) as string | null,
  };
}

export async function requireViolationAdmin(
  supabase: SupabaseClient,
  user: User,
) {
  const profile = await getUserProfile(supabase, user.id);
  if (!profile) return { ok: false as const, response: jsonForbidden() };
  if (!hasUnifiedPermission(profile.businessRole as BusinessRole, profile.permissions, "manage_violations")) {
    return { ok: false as const, response: jsonForbidden("缺少违规话术复核权限") };
  }
  return { ok: true as const, profile };
}

export async function getOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string | null,
) {
  if (!accountId) return { ok: true as const, account: null };

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, profile_id")
    .eq("id", accountId)
    .eq("profile_id", userId)
    .single();

  if (error || !data) {
    return {
      ok: false as const,
      response: jsonForbidden("account_id 不属于当前用户"),
    };
  }

  return {
    ok: true as const,
    account: {
      id: data.id as string,
      name: data.name as string,
      profile_id: data.profile_id as string,
    },
  };
}

export function parsePageParams(searchParams: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSizeInput = Number.parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const pageSize = Math.min(50, Math.max(1, pageSizeInput));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export function sanitizeStoragePathSegments(segments: string[]) {
  const joined = segments.map((segment) => decodeURIComponent(segment)).join("/");
  const normalized = joined
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");

  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }

  return normalized;
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return cleaned || "screenshot";
}
