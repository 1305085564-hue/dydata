import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { inferDataScope } from "@/lib/data-access-scope";
import { hasAnyPermission, hasPermission } from "@/lib/permission-utils";
import type { DataScope, Permissions, UserRole } from "@/types";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

export interface UserPermissionInfo {
  userId: string;
  name: string | null;
  role: UserRole;
  permissions: Permissions;
  dataScope: DataScope;
  teamId: string | null;
}

function isMissingColumn(error: { message?: string } | null | undefined, column: string) {
  const msg = error?.message ?? "";
  return msg.includes(column) || msg.includes("Could not find");
}

const loadUserPermissions = cache(async (): Promise<UserPermissionInfo | null> => {
  const { user, authError } = await getCurrentUserContext();
  if (authError || !user) return null;

  const adminSupabase = createAdminClient();
  const primary = await adminSupabase
    .from("profiles")
    .select("id, name, role, permissions, data_scope, team_id")
    .eq("id", user.id)
    .single();

  let profile: {
    id: string;
    name: string | null;
    role: UserRole | null;
    permissions: Permissions | null;
    data_scope?: DataScope | null;
    team_id: string | null;
  } | null;

  let dataScope: DataScope = "self";

  if (!isMissingColumn(primary.error, "data_scope")) {
    assertSupabaseQuerySucceeded(primary.error, "加载用户权限失败");
    profile = primary.data as typeof profile;
    dataScope = (profile?.data_scope as DataScope | null | undefined) ?? "self";
  } else {
    // data_scope 列尚未迁移，降级查询并从 role 推断
    const fallback = await adminSupabase
      .from("profiles")
      .select("id, name, role, permissions, team_id")
      .eq("id", user.id)
      .single();
    assertSupabaseQuerySucceeded(fallback.error, "加载用户权限失败");
    profile = fallback.data as typeof profile;
    dataScope = inferDataScope(profile?.role, profile?.permissions);
  }

  if (!profile) return null;

  const role = profile.role as UserRole;
  const permissions = (profile.permissions ?? {}) as Permissions;

  return {
    userId: user.id,
    name: profile.name ?? null,
    role,
    permissions,
    dataScope,
    teamId: profile.team_id ?? null,
  };
});

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  return loadUserPermissions();
}

export { hasAnyPermission, hasPermission };
