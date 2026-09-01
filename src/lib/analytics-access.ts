import { hasAnyPermission, hasPermission } from "@/lib/permission-utils";
import type { PermissionKey, Permissions, UserRole } from "@/types";

export type AnalyticsRangePreset = "7d" | "30d" | "month" | "custom";

interface BuildAnalyticsAccessContextInput {
  userId: string;
  role: UserRole;
  permissions?: Permissions;
  teamId: string | null;
}

export interface AnalyticsAccessContext {
  userId: string;
  role: UserRole;
  effectiveTeamId: string | null;
  canViewAllMembers: boolean;
}

export interface NavigationAccess {
  showAnalytics: boolean;
  showAdmin: boolean;
}

interface RestrictPersonRowsOptions {
  role: UserRole;
  currentUserName: string;
}

interface PresetRangeInput {
  from?: string;
  to?: string;
}

export interface PresetRange {
  from: string;
  to: string;
  preset: AnalyticsRangePreset;
}

const ADMIN_NAV_PERMISSION_KEYS: readonly PermissionKey[] = [
  "view_conversion",
  "review_content",
  "manage_fulfillment",
  "manage_videos",
  "manage_members",
  "review_violations",
  "manage_system",
  "use_ai_assist",
];

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function canAccessAdmin(role: UserRole, permissions: Permissions = {}) {
  return hasAnyPermission(role, permissions);
}

export function canAccessAdminPath(pathname: string, role: UserRole, permissions: Permissions = {}) {
  if (pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")) {
    return hasPermission(role, permissions, "manage_system");
  }
  if (pathname === "/admin/ai-config" || pathname.startsWith("/admin/ai-config/")) {
    return hasPermission(role, permissions, "manage_system");
  }
  if (pathname === "/admin/modules" || pathname.startsWith("/admin/modules/")) {
    return hasPermission(role, permissions, "manage_members");
  }
  if (pathname === "/admin/collaboration" || pathname.startsWith("/admin/collaboration/")) {
    return hasPermission(role, permissions, "view_analytics");
  }
  if (pathname === "/admin/content" || pathname.startsWith("/admin/content/")) {
    return hasPermission(role, permissions, "review_content");
  }
  if (pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/")) {
    return hasPermission(role, permissions, "manage_fulfillment");
  }
  if (pathname === "/admin/videos" || pathname.startsWith("/admin/videos/")) {
    return hasPermission(role, permissions, "manage_videos");
  }

  return pathname === "/admin"
    ? ADMIN_NAV_PERMISSION_KEYS.some((key) => hasPermission(role, permissions, key))
    : false;
}

export function buildAnalyticsAccessContext({ userId, role, permissions = {}, teamId }: BuildAnalyticsAccessContextInput): AnalyticsAccessContext {
  return {
    userId,
    role,
    effectiveTeamId: teamId ?? null,
    canViewAllMembers: hasPermission(role, permissions, "manage_members"),
  };
}

export function getNavigationAccess(role: UserRole, permissions: Permissions = {}): NavigationAccess {
  return {
    showAnalytics: hasPermission(role, permissions, "view_analytics"),
    showAdmin: ADMIN_NAV_PERMISSION_KEYS.some((key) => hasPermission(role, permissions, key)),
  };
}

export function restrictPersonRows<T extends { submitter: string }>(rows: T[], { role, currentUserName }: RestrictPersonRowsOptions) {
  if (role === "admin" || role === "owner") return rows;
  return rows.filter((row) => row.submitter === currentUserName);
}

export function getPresetRange(
  preset: AnalyticsRangePreset,
  now = new Date(),
  customRange: PresetRangeInput = {},
): PresetRange {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  if (preset === "custom") {
    return {
      from: customRange.from ?? formatDate(end),
      to: customRange.to ?? formatDate(end),
      preset,
    };
  }

  if (preset === "month") {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return {
      from: formatDate(start),
      to: formatDate(end),
      preset,
    };
  }

  const days = preset === "7d" ? 6 : 29;
  return {
    from: formatDate(shiftDays(end, -days)),
    to: formatDate(end),
    preset,
  };
}
