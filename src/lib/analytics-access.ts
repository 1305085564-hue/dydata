import { hasPermission } from "@/lib/permission-utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

export type AnalyticsRangePreset = "7d" | "30d" | "month" | "custom";

interface BuildAnalyticsAccessContextInput {
  userId: string;
  role: UserRole | BusinessRole;
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

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function canAccessTeamManagement(role: UserRole | BusinessRole, permissions: Permissions = {}) {
  if (role === "owner" || role === "admin" || role === "team_admin" || role === "group_leader") return true;
  return (
    hasPermission(role, permissions, "view_all_data") ||
    hasPermission(role, permissions, "edit_data") ||
    hasPermission(role, permissions, "export_data") ||
    hasPermission(role, permissions, "view_analytics") ||
    hasPermission(role, permissions, "manage_members") ||
    hasPermission(role, permissions, "manage_violations") ||
    hasPermission(role, permissions, "view_conversion_hub") ||
    hasPermission(role, permissions, "view_content_review") ||
    hasPermission(role, permissions, "manage_video_assets") ||
    hasPermission(role, permissions, "use_ai_management")
  );
}

export function canAccessSystemSettings(role: UserRole | BusinessRole, permissions: Permissions = {}) {
  return role === "owner" || role === "team_admin" || hasPermission(role, permissions, "manage_members");
}

function canAccessMembersSettings(role: UserRole | BusinessRole, permissions: Permissions = {}) {
  return role === "owner" || role === "team_admin" || hasPermission(role, permissions, "manage_members");
}

function canAccessAiSettings(role: UserRole | BusinessRole) {
  return role === "owner";
}

function canAccessDailyManagementPath(pathname: string, role: UserRole | BusinessRole, permissions: Permissions = {}) {
  if (!canAccessTeamManagement(role, permissions)) return false;
  if (pathname === "/admin/content" || pathname.startsWith("/admin/content/")) {
    return role === "owner" || hasPermission(role, permissions, "view_content_review") || hasPermission(role, permissions, "view_analytics");
  }
  if (pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/")) {
    return role === "owner" || role === "team_admin" || role === "group_leader"
      || hasPermission(role, permissions, "view_analytics")
      || hasPermission(role, permissions, "view_all_data");
  }
  if (pathname === "/admin/videos" || pathname.startsWith("/admin/videos/")) {
    return role === "owner" || hasPermission(role, permissions, "manage_video_assets") || hasPermission(role, permissions, "view_analytics");
  }
  if (
    pathname === "/admin/analytics" ||
    pathname.startsWith("/admin/analytics/") ||
    pathname === "/admin/advice" ||
    pathname.startsWith("/admin/advice/") ||
    pathname === "/admin/guidance" ||
    pathname.startsWith("/admin/guidance/")
  ) {
    return role === "owner" || hasPermission(role, permissions, "view_analytics") || hasPermission(role, permissions, "view_all_data");
  }
  return pathname === "/admin";
}

export function buildAnalyticsAccessContext({ userId, role, permissions = {}, teamId }: BuildAnalyticsAccessContextInput): AnalyticsAccessContext {
  const effectiveTeamId = teamId ?? null;
  const canViewAllMembers = role === "admin" || role === "team_admin" || hasPermission(role, permissions, "view_all_data");

  return {
    userId,
    role: role === "team_admin" || role === "group_leader" ? "admin" : role,
    effectiveTeamId,
    canViewAllMembers,
  };
}

export function canAccessAdminPath(pathname: string, role: UserRole | BusinessRole, permissions: Permissions = {}) {
  if (pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")) {
    return canAccessSystemSettings(role, permissions);
  }
  if (pathname === "/admin/modules" || pathname.startsWith("/admin/modules/")) {
    return canAccessMembersSettings(role, permissions);
  }
  if (
    pathname === "/admin/ai-config" ||
    pathname.startsWith("/admin/ai-config/") ||
    pathname === "/admin/ai-channels" ||
    pathname.startsWith("/admin/ai-channels/") ||
    pathname === "/admin/ai-rewrite" ||
    pathname.startsWith("/admin/ai-rewrite/")
  ) {
    return canAccessAiSettings(role);
  }
  return canAccessDailyManagementPath(pathname, role, permissions);
}

export function getNavigationAccess(role: UserRole | BusinessRole, permissions: Permissions = {}): NavigationAccess {
  return {
    showAnalytics: role === "admin" || role === "owner" || hasPermission(role, permissions, "view_analytics") || hasPermission(role, permissions, "view_all_data"),
    showAdmin: canAccessTeamManagement(role, permissions),
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
