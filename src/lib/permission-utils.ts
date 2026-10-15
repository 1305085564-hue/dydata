import { fixedPermissionsForRole, hasFixedPermission } from "@/lib/company-permissions";
import type { CompanyRole, PermissionKey, Permissions, UserRole } from "@/types";

export function hasCompanyPermission(
  role: CompanyRole | UserRole | string | null | undefined,
  key: PermissionKey,
) {
  return hasFixedPermission(role, key);
}

export function fixedPermissions(
  role: CompanyRole | UserRole | string | null | undefined,
  legacyPermissions: Permissions | null | undefined,
) {
  return fixedPermissionsForRole(role, legacyPermissions);
}

export function hasAnyPermission(
  _role: import("@/types").UserRole | undefined,
  permissions: import("@/types").Permissions,
): boolean {
  return Object.values(permissions).some((value) => value === true);
}

export function canUseAiCopywriting(
  _role: import("@/types").UserRole | undefined,
  permissions: import("@/types").Permissions,
): boolean {
  return permissions.use_ai_copy === true;
}
