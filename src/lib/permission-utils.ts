import type { PermissionKey, Permissions, UserRole } from "@/types";

export function hasPermission(
  role: UserRole,
  permissions: Permissions,
  key: PermissionKey,
): boolean {
  if (role === "owner") return true;
  if (role !== "admin") return false;
  return permissions[key] === true;
}

export function isAdminLevel(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}
