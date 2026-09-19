import type { CompanyRole, PermissionKey, Permissions, UserRole } from "@/types";
import { PERMISSION_CONTRACT } from "@/lib/permission-contract";

export const DEFAULT_PERMISSIONS_BY_COMPANY_ROLE: Record<CompanyRole, readonly PermissionKey[]> =
  PERMISSION_CONTRACT.roles;

export const PERMISSION_KEYS_FOR_GROUP_MODE: readonly PermissionKey[] =
  PERMISSION_CONTRACT.groupMode.permissions;

export function resolveCompanyRole(value: unknown): CompanyRole | null {
  if (value === "company_owner" || value === "owner") return "company_owner";
  if (value === "admin") return "admin";
  if (value === "member") return "member";
  return null;
}

export type ProfileRoleResolutionSource = "role" | "company_role" | "conflict" | "none";

export interface ProfileRoleResolution {
  companyRole: CompanyRole | null;
  source: ProfileRoleResolutionSource;
  conflict: boolean;
}

/**
 * Resolve the two profile role columns at the application boundary.
 *
 * `role` is the primary field. `company_role` is only a migration fallback.
 * If both fields contain valid but different roles, fail closed instead of
 * silently choosing the role that could grant more access.
 */
export function resolveProfileCompanyRole(
  role: unknown,
  companyRole: unknown,
): ProfileRoleResolution {
  const primaryRole = resolveCompanyRole(role);
  const fallbackRole = resolveCompanyRole(companyRole);

  if (primaryRole && fallbackRole && primaryRole !== fallbackRole) {
    return { companyRole: null, source: "conflict", conflict: true };
  }

  if (primaryRole) {
    return { companyRole: primaryRole, source: "role", conflict: false };
  }

  // Compatibility fallback is for rows that have no primary role yet. An
  // unknown non-empty primary value must not be upgraded by company_role.
  const primaryRoleMissing = role === null || role === undefined || role === "";
  if (primaryRoleMissing && fallbackRole) {
    return { companyRole: fallbackRole, source: "company_role", conflict: false };
  }

  return { companyRole: null, source: "none", conflict: false };
}

/**
 * Resolve an already-authenticated actor whose runtime role may represent
 * company_owner as `admin`. Raw profile rows must continue using
 * resolveProfileCompanyRole so real column conflicts still fail closed.
 */
export function resolveActorCompanyRole(
  runtimeRole: unknown,
  companyRole: unknown,
): ProfileRoleResolution {
  const resolvedCompanyRole = resolveCompanyRole(companyRole);
  if (resolvedCompanyRole === "company_owner" && runtimeRole === "admin") {
    return { companyRole: "company_owner", source: "company_role", conflict: false };
  }
  return resolveProfileCompanyRole(runtimeRole, companyRole);
}

export function canEnterGroupMode(
  role: CompanyRole | UserRole | string | null | undefined,
  membershipStatus: unknown,
) {
  return membershipStatus !== "archived" && resolveCompanyRole(role) === "company_owner";
}

export function buildCompanyRoleProfilePatch(role: "member" | "admin") {
  return {
    role,
    company_role: role,
    ...(role === "member" ? { permissions: {} } : {}),
  } as const;
}

/**
 * Old UI and service contracts only understand member/admin/owner. Never emit
 * owner here: that value still triggers legacy group-wide bypasses.
 */
export function runtimeRoleForCompanyRole(role: CompanyRole): UserRole {
  return role === "member" ? "member" : "admin";
}

export function fixedPermissionsForRole(
  role: CompanyRole | UserRole | string | null | undefined,
  legacyPermissions: Permissions | null | undefined = null,
  groupMode = false,
): Permissions {
  void legacyPermissions;
  // Keep the argument for the existing call signature. Group mode changes
  // data visibility and token state; it never grants capabilities to a role.
  void groupMode;

  const companyRole = resolveCompanyRole(role) ?? "member";
  return Object.fromEntries(PERMISSION_CONTRACT.roles[companyRole].map((key) => [key, true]));
}

export function hasFixedPermission(
  role: CompanyRole | UserRole | string | null | undefined,
  key: PermissionKey,
  groupMode = false,
) {
  return fixedPermissionsForRole(role, null, groupMode)[key] === true;
}
