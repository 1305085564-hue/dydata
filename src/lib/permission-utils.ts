import {
  hasBusinessPermission,
  normalizePermissionsForBusinessRole,
  type BusinessRole,
} from "@/lib/business-role";
import type { PermissionKey, Permissions, UserRole } from "@/types";

type PermissionRole = UserRole | BusinessRole;

function isBusinessRole(role: PermissionRole): role is BusinessRole {
  return role === "team_admin" || role === "group_leader";
}

export function hasPermission(
  role: PermissionRole,
  permissions: Permissions,
  key: PermissionKey,
): boolean {
  if (role === "owner") return true;
  if (isBusinessRole(role)) return hasBusinessPermission(role, permissions, key);
  if (role === "admin") return permissions[key] === true;
  if (role === "member") return permissions[key] === true;
  return false;
}

export function isAdminLevel(role: PermissionRole): boolean {
  return role === "admin" || role === "owner" || role === "team_admin" || role === "group_leader";
}

export function canUseAiCopywriting(role: PermissionRole, permissions: Permissions): boolean {
  return hasPermission(role, permissions, "use_ai_copywriting");
}

export { normalizePermissionsForBusinessRole };
