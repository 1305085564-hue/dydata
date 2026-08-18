import { fixedPermissionsForRole, hasFixedPermission } from "@/lib/company-permissions";
import type { CompanyRole, PermissionKey, Permissions, UserRole } from "@/types";

/**
 * Compatibility helper for old callers. New server boundaries should use
 * `hasCompanyPermission`, which does not trust the legacy JSON column.
 */
export function hasPermission(
  role: UserRole | undefined,
  permissions: Permissions,
  key: PermissionKey,
): boolean {
  if (role === "owner") return true;
  return permissions[key] === true;
}

export function hasCompanyPermission(
  role: CompanyRole | UserRole | string | null | undefined,
  key: PermissionKey,
  groupMode = false,
) {
  return hasFixedPermission(role, key, groupMode);
}

export function fixedPermissions(
  role: CompanyRole | UserRole | string | null | undefined,
  legacyPermissions: Permissions | null | undefined,
  groupMode = false,
) {
  return fixedPermissionsForRole(role, legacyPermissions, groupMode);
}

export function hasAnyPermission(
  role: import("@/types").UserRole | undefined,
  permissions: import("@/types").Permissions,
): boolean {
  if (role === "owner") return true;
  return Object.values(permissions).some((value) => value === true);
}

export function canUseAiCopywriting(
  role: import("@/types").UserRole | undefined,
  permissions: import("@/types").Permissions,
): boolean {
  return hasPermission(role, permissions, "use_ai_copy");
}
