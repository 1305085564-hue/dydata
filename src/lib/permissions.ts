import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessRole,
  type BusinessGroup,
} from "@/lib/business-role";
import { hasPermission, isAdminLevel } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

interface UserPermissionInfo {
  userId: string;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  teamId: string | null;
  groupId: string | null;
  ledGroupIds: string[];
}

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, team_id, group_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const { data: ledGroups } = await adminSupabase
    .from("groups")
    .select("id, team_id, leader_user_id")
    .eq("leader_user_id", user.id);
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
    role,
    businessRole,
    permissions: normalizePermissionsForBusinessRole(businessRole, rawPermissions),
    teamId: profile.team_id ?? null,
    groupId: profile.group_id ?? null,
    ledGroupIds: groups.map((group) => group.id),
  };
}

export { hasPermission, isAdminLevel };
