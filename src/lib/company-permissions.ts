import type { CompanyRole, PermissionKey, Permissions, UserRole } from "@/types";

/**
 * The company role is the stable business identity. `owner` remains accepted
 * only at migration boundaries for rows that have not been converted yet.
 */
export const COMPANY_ROLES: readonly CompanyRole[] = ["member", "admin", "company_owner"];

export const DEFAULT_PERMISSIONS_BY_COMPANY_ROLE: Record<CompanyRole, readonly PermissionKey[]> = {
  member: [
    "view_analytics",
    "export_data",
  ],
  admin: [
    "view_analytics",
    "export_data",
    "view_conversion",
    "review_content",
    "manage_fulfillment",
    "manage_videos",
    "manage_members",
    "review_violations",
    "use_ai_copy",
  ],
  company_owner: [
    "view_analytics",
    "export_data",
    "view_conversion",
    "review_content",
    "manage_fulfillment",
    "manage_videos",
    "manage_members",
    "review_violations",
    "manage_system",
    "use_ai_copy",
    "use_ai_assist",
  ],
};

export const PERMISSION_KEYS_FOR_GROUP_MODE: readonly PermissionKey[] = [
  "view_analytics",
  "export_data",
  "view_conversion",
  "review_content",
  "manage_fulfillment",
  "manage_videos",
  "manage_members",
  "review_violations",
  "manage_system",
  "use_ai_copy",
  "use_ai_assist",
];

export function resolveCompanyRole(value: unknown): CompanyRole | null {
  if (value === "company_owner" || value === "owner") return "company_owner";
  if (value === "admin") return "admin";
  if (value === "member") return "member";
  return null;
}

export function canEnterGroupMode(
  role: CompanyRole | UserRole | string | null | undefined,
  membershipStatus: unknown,
) {
  return membershipStatus !== "archived" && resolveCompanyRole(role) === "company_owner";
}

export function isCompanyRole(value: unknown): value is CompanyRole {
  return value === "member" || value === "admin" || value === "company_owner";
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
  if (groupMode) {
    return Object.fromEntries(PERMISSION_KEYS_FOR_GROUP_MODE.map((key) => [key, true]));
  }

  const companyRole = resolveCompanyRole(role) ?? "member";
  return Object.fromEntries(DEFAULT_PERMISSIONS_BY_COMPANY_ROLE[companyRole].map((key) => [key, true]));
}

export function hasFixedPermission(
  role: CompanyRole | UserRole | string | null | undefined,
  key: PermissionKey,
  groupMode = false,
) {
  return fixedPermissionsForRole(role, null, groupMode)[key] === true;
}

export function canOperateCurrentMembership(membershipStatus: unknown) {
  return membershipStatus !== "archived";
}
