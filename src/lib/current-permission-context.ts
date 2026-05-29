import { cache } from "react";
import {
  buildDataAccessScope,
  inferBusinessAccessLevel,
  type DataAccessScope,
} from "@/lib/data-access-scope";
import type { AdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { getUserPermissions, type UserPermissionInfo } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

export interface CurrentPermissionContext {
  permissionInfo: UserPermissionInfo;
  scope: DataAccessScope;
}

function toPermissionInfo(actor: {
  userId: string;
  name: string | null;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  accessLevel?: number | null;
  teamId?: string | null;
  groupId?: string | null;
  ledGroupIds?: string[];
}): UserPermissionInfo {
  return {
    userId: actor.userId,
    name: actor.name,
    role: actor.role,
    businessRole: actor.businessRole,
    permissions: actor.permissions,
    accessLevel: actor.accessLevel ?? null,
    teamId: actor.teamId ?? null,
    groupId: actor.groupId ?? null,
    ledGroupIds: actor.ledGroupIds ?? [],
  };
}

async function resolveCurrentPermissionContext(
  perspective: "company" | "team" = "company",
  teamId: string | null = null,
): Promise<CurrentPermissionContext | null> {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) return null;

  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, permissionInfo.userId, {
    perspective,
    teamId,
    profile: {
      id: permissionInfo.userId,
      role: permissionInfo.role,
      permissions: permissionInfo.permissions,
      access_level: permissionInfo.accessLevel ?? inferBusinessAccessLevel(permissionInfo.businessRole),
      team_id: permissionInfo.teamId,
      group_id: permissionInfo.groupId,
      led_group_ids: permissionInfo.ledGroupIds,
      business_role: permissionInfo.businessRole,
    },
  });
  if (!scope) return null;

  return { permissionInfo, scope };
}

export const getCurrentPermissionContext = cache(resolveCurrentPermissionContext);

export async function buildPermissionContextForActor(
  actor: AdminActor,
  options: {
    perspective?: "company" | "team";
    teamId?: string | null;
  } = {},
): Promise<CurrentPermissionContext | null> {
  const permissionInfo = toPermissionInfo(actor);
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, actor.userId, {
    perspective: options.perspective,
    teamId: options.teamId ?? null,
    profile: {
      id: permissionInfo.userId,
      role: permissionInfo.role,
      permissions: permissionInfo.permissions,
      access_level: permissionInfo.accessLevel ?? inferBusinessAccessLevel(permissionInfo.businessRole),
      team_id: permissionInfo.teamId,
      group_id: permissionInfo.groupId,
      led_group_ids: permissionInfo.ledGroupIds,
      business_role: permissionInfo.businessRole,
    },
  });
  if (!scope) return null;

  return { permissionInfo, scope };
}
