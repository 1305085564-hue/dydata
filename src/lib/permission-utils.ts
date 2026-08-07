export function hasPermission(
  role: import("@/types").UserRole | undefined,
  permissions: import("@/types").Permissions,
  key: import("@/types").PermissionKey,
): boolean {
  if (role === "owner") return true;
  return permissions[key] === true;
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
