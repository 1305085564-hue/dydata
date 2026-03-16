import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, Permissions, UserRole } from "@/types";

interface UserPermissionInfo {
  userId: string;
  role: UserRole;
  permissions: Permissions;
}

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    role: profile.role as UserRole,
    permissions: (profile.permissions ?? {}) as Permissions,
  };
}

export function hasPermission(
  role: UserRole,
  permissions: Permissions,
  key: PermissionKey
): boolean {
  if (role === "owner") return true;
  if (role !== "admin") return false;
  return permissions[key] === true;
}

export function isAdminLevel(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}
