import { hasAnyPermission } from "@/lib/permission-utils";
import { canAccessRoute } from "@/lib/route-permissions";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { Permissions, UserRole } from "@/types";

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
  role?: UserRole | string | null;
  companyRole?: string | null;
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

export function canAccessAdmin(role: UserRole, permissions: Permissions = {}) {
  return hasAnyPermission(role, permissions);
}

export function canAccessAdminPath(pathname: string, _role: UserRole, permissions: Permissions = {}) {
  return canAccessRoute(pathname, permissions);
}

export function buildAnalyticsAccessContext({ userId, role, permissions = {}, teamId }: BuildAnalyticsAccessContextInput): AnalyticsAccessContext {
  return {
    userId,
    role,
    effectiveTeamId: teamId ?? null,
    canViewAllMembers: permissions.manage_members === true,
  };
}

export function getNavigationAccess(role: UserRole, permissions: Permissions = {}): NavigationAccess {
  return {
    showAnalytics: permissions.view_analytics === true,
    showAdmin: canAccessRoute("/admin", permissions),
  };
}

export function restrictPersonRows<T extends { submitter: string }>(rows: T[], { role, companyRole, currentUserName }: RestrictPersonRowsOptions) {
  const roleResolution = resolveProfileCompanyRole(role, companyRole);
  if (!roleResolution.conflict && (roleResolution.companyRole === "admin" || roleResolution.companyRole === "company_owner")) {
    return rows;
  }
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
