import { cache } from "react";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import type { AdminActor } from "@/app/api/admin/auth-helper";
import { getUserPermissions, type UserPermissionInfo } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CurrentPermissionContext {
  permissionInfo: UserPermissionInfo;
  scope: DataAccessScope;
}

async function resolveCurrentPermissionContext(
  perspective: "company" | "team" = "company",
  teamId: string | null = null,
): Promise<CurrentPermissionContext | null> {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) return null;
  return buildPermissionContextFromPermissionInfo(permissionInfo, { perspective, teamId });
}

export const getCurrentPermissionContext = cache(resolveCurrentPermissionContext);

export async function buildPermissionContextFromPermissionInfo(
  permissionInfo: UserPermissionInfo,
  options: {
    perspective?: "company" | "team";
    teamId?: string | null;
  } = {},
): Promise<CurrentPermissionContext | null> {
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, permissionInfo.userId, {
    teamId: options.teamId ?? null,
    profile: {
      id: permissionInfo.userId,
      role: permissionInfo.role,
      permissions: permissionInfo.permissions,
      data_scope: permissionInfo.dataScope,
      team_id: permissionInfo.teamId ?? null,
      company_role: permissionInfo.companyRole,
      group_mode: permissionInfo.groupMode === true,
      group_mode_token_hash: permissionInfo.groupModeTokenHash,
      membership_status: permissionInfo.membershipStatus,
    },
  });
  if (!scope) return null;

  return { permissionInfo, scope };
}

export async function buildPermissionContextForActor(
  actor: AdminActor,
  options: {
    perspective?: "company" | "team";
    teamId?: string | null;
  } = {},
): Promise<CurrentPermissionContext | null> {
  const permissionInfo = {
    userId: actor.userId,
    name: actor.name,
    role: actor.role,
    permissions: actor.permissions,
    dataScope: actor.dataScope ?? "self",
    teamId: actor.teamId ?? null,
    companyRole: actor.companyRole,
    groupMode: actor.groupMode,
    groupModeTokenHash: actor.groupModeTokenHash,
    membershipStatus: actor.membershipStatus,
  } satisfies UserPermissionInfo;
  return buildPermissionContextFromPermissionInfo(permissionInfo, options);
}
