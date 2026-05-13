import type { PermissionKey, Permissions, UserRole } from "@/types";

export function hasPermission(
  role: UserRole,
  permissions: Permissions,
  key: PermissionKey,
): boolean {
  if (role === "owner") return true;
  if (role === "admin") return permissions[key] === true;
  if (role === "member") return permissions[key] === true;
  return false;
}

export function isAdminLevel(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

export function canUseAiCopywriting(role: UserRole, permissions: Permissions): boolean {
  return hasPermission(role, permissions, "use_ai_copywriting");
}

export function canUseAiManagement(role: UserRole, permissions: Permissions): boolean {
  return hasPermission(role, permissions, "use_ai_management");
}
