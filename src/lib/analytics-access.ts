import type { UserRole } from "@/types";

export type AnalyticsRangePreset = "7d" | "30d" | "month" | "custom";

interface BuildAnalyticsAccessContextInput {
  userId: string;
  role: UserRole;
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

export function buildAnalyticsAccessContext({ userId, role, teamId, demoTeamId }: BuildAnalyticsAccessContextInput): AnalyticsAccessContext {
  const effectiveTeamId = teamId ?? demoTeamId ?? null;
  const canViewAllMembers = role === "admin" || role === "owner";

  return {
    userId,
    role,
    effectiveTeamId,
    canViewAllMembers,
    isDemoFallback: !teamId && Boolean(demoTeamId),
  };
}

export function canAccessAdminPath(pathname: string, role: UserRole) {
  if (role === "admin" || role === "owner") return true;
  return pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/");
}

export function getNavigationAccess(role: UserRole): NavigationAccess {
  return {
    showAnalytics: true,
    showAdmin: role === "admin" || role === "owner",
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
