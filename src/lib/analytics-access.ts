import { hasAnyPermission } from "@/lib/permission-utils";
import { canAccessRoute } from "@/lib/route-permissions";
import { hasFixedPermission, resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { Permissions, UserRole } from "@/types";

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
  if (
    !roleResolution.conflict &&
    roleResolution.companyRole &&
    hasFixedPermission(roleResolution.companyRole, "manage_members")
  ) {
    return rows;
  }
  return rows.filter((row) => row.submitter === currentUserName);
}
