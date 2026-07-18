import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/current-user-context";
import {
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessRole,
  type BusinessGroup,
} from "@/lib/business-role";
import { hasPermission, isAdminLevel } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

export interface UserPermissionInfo {
  userId: string;
  name: string | null;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  accessLevel: number | null;
  teamId: string | null;
  groupId: string | null;
  ledGroupIds: string[];
}

function isMissingAccessLevelColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("profiles.access_level") || message.includes("access_level") || message.includes("Could not find");
}

const loadUserPermissions = cache(async (): Promise<UserPermissionInfo | null> => {
  const { user, authError } = await getCurrentUserContext();
  assertSupabaseQuerySucceeded(authError, "验证登录状态失败");
  if (!user) return null;

  const adminSupabase = createAdminClient();
  const primary = await adminSupabase
    .from("profiles")
    .select("id, name, role, permissions, access_level, team_id, group_id")
    .eq("id", user.id)
    .single();
  let profile: {
        id: string;
        name: string | null;
        role: UserRole | null;
        permissions: Permissions | null;
        access_level?: number | string | null;
        team_id: string | null;
        group_id: string | null;
      } | null;
  if (!isMissingAccessLevelColumn(primary.error)) {
    assertSupabaseQuerySucceeded(primary.error, "加载用户权限失败");
    profile = primary.data as typeof profile;
  } else {
    const fallback = await adminSupabase
        .from("profiles")
        .select("id, name, role, permissions, team_id, group_id")
        .eq("id", user.id)
        .single();
    assertSupabaseQuerySucceeded(fallback.error, "加载用户权限失败");
    profile = fallback.data as typeof profile;
  }

  if (!profile) return null;

  const groupsResult = await adminSupabase
    .from("groups")
    .select("id, team_id, leader_user_id")
    .eq("leader_user_id", user.id);
  assertSupabaseQuerySucceeded(groupsResult.error, "加载用户领导小组失败");
  const ledGroups = groupsResult.data;
  const groups = (ledGroups ?? []) as BusinessGroup[];
  const role = profile.role as UserRole;
  const rawPermissions = (profile.permissions ?? {}) as Permissions;
  const businessRole = resolveBusinessRole(
    {
      id: profile.id,
      role,
      permissions: rawPermissions,
      team_id: profile.team_id ?? null,
      group_id: profile.group_id ?? null,
    },
    groups,
  );

  return {
    userId: user.id,
    name: profile.name ?? null,
    role,
    businessRole,
    permissions: normalizePermissionsForBusinessRole(businessRole, rawPermissions),
    accessLevel: typeof profile.access_level === "number" ? profile.access_level : null,
    teamId: profile.team_id ?? null,
    groupId: profile.group_id ?? null,
    ledGroupIds: groups.map((group) => group.id),
  };
});

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  return loadUserPermissions();
}

export { hasPermission, isAdminLevel };
