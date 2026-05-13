import { hasPermission } from "@/lib/permission-utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

export type AnalyticsRangePreset = "7d" | "30d" | "month" | "custom";

interface BuildAnalyticsAccessContextInput {
  userId: string;
  role: UserRole | BusinessRole;
  permissions?: Permissions;
  teamId: string | null;
  demoTeamId: string | null;
}

export interface AnalyticsAccessContext {
  userId: string;
  role: UserRole;
  effectiveTeamId: string | null;
  canViewAllMembers: boolean;
  isDemoFallback: boolean;
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

function canAccessAdminShell(role: UserRole | BusinessRole, permissions: Permissions = {}) {
  if (role === "owner" || role === "admin" || role === "team_admin" || role === "group_leader") return true;
  return (
    hasPermission(role, permissions, "view_all_data") ||
    hasPermission(role, permissions, "edit_data") ||
    hasPermission(role, permissions, "export_data") ||
    hasPermission(role, permissions, "manage_invite") ||
    hasPermission(role, permissions, "view_analytics") ||
    hasPermission(role, permissions, "view_audit_log") ||
    hasPermission(role, permissions, "manage_members") ||
    hasPermission(role, permissions, "manage_violations") ||
    hasPermission(role, permissions, "use_ai_management")
  );
}

export function buildAnalyticsAccessContext({ userId, role, permissions = {}, teamId, demoTeamId }: BuildAnalyticsAccessContextInput): AnalyticsAccessContext {
  const effectiveTeamId = teamId ?? demoTeamId ?? null;
  const canViewAllMembers = role === "admin" || role === "team_admin" || hasPermission(role, permissions, "view_all_data");

  return {
    userId,
    role: role === "team_admin" || role === "group_leader" ? "admin" : role,
    effectiveTeamId,
    canViewAllMembers,
    isDemoFallback: !teamId && Boolean(demoTeamId),
  };
}

export function canAccessAdminPath(pathname: string, role: UserRole | BusinessRole, permissions: Permissions = {}) {
  return canAccessAdminShell(role, permissions);
}

export function getNavigationAccess(role: UserRole | BusinessRole, permissions: Permissions = {}): NavigationAccess {
  return {
    showAnalytics: role === "admin" || role === "owner" || hasPermission(role, permissions, "view_analytics") || hasPermission(role, permissions, "view_all_data"),
    showAdmin: canAccessAdminShell(role, permissions),
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
