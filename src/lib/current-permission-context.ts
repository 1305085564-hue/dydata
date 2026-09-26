import { cache } from "react";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import type { AdminActor } from "@/lib/admin-auth-contract";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canEnterGroupMode,
  fixedPermissionsForRole,
  resolveProfileCompanyRole,
  runtimeRoleForCompanyRole,
} from "@/lib/company-permissions";
import { resolveGroupModeForUser } from "@/lib/group-mode-server";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { CompanyRole, DataScope, Permissions, UserRole } from "@/types";

export interface UserPermissionInfo {
  userId: string;
  name: string | null;
  role: UserRole;
  permissions: Permissions;
  dataScope: DataScope;
  teamId: string | null;
  companyRole?: CompanyRole;
  membershipStatus?: "active" | "archived";
  groupMode?: boolean;
  groupModeTokenHash?: string;
  hasGroupOwnerQualification?: boolean;
}

export interface PermissionCore extends UserPermissionInfo {
  companyRole: CompanyRole;
  membershipStatus: "active";
  scope: DataAccessScope;
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"];
}

export interface CurrentPermissionContext {
  permissionInfo: UserPermissionInfo;
  scope: DataAccessScope;
}

export function resolvePermissionIdentity(
  profile: {
    role: unknown;
    company_role: unknown;
    membership_status: unknown;
  },
  requestedGroupMode: boolean,
) {
  if (profile.membership_status !== "active") return null;

  const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (roleResolution.conflict) return null;
  const companyRole = roleResolution.companyRole;
  if (!companyRole) return null;

  const groupMode = requestedGroupMode
    && canEnterGroupMode(companyRole, profile.membership_status);
  const role = runtimeRoleForCompanyRole(companyRole);

  return {
    companyRole,
    membershipStatus: "active" as const,
    groupMode,
    role,
    permissions: fixedPermissionsForRole(companyRole),
  };
}

const loadPermissionCore = cache(async (): Promise<PermissionCore | null> => {
  const { supabase, user, authError } = await getCurrentUserContext();
  if (authError || !user) return null;

  const adminSupabase = createAdminClient();
  const [profileResult, groupModeState] = await Promise.all([
    adminSupabase
      .from("profiles")
      .select("id, name, role, company_role, membership_status, team_id")
      .eq("id", user.id)
      .single(),
    resolveGroupModeForUser(user.id, adminSupabase),
  ]);

  if (profileResult.error) {
    if (profileResult.error.code === "PGRST116") return null;
    assertSupabaseQuerySucceeded(profileResult.error, "加载用户权限失败");
  }

  const profile = profileResult.data;
  if (!profile) return null;
  const identity = resolvePermissionIdentity(profile, groupModeState.active);
  if (!identity) return null;
  const { companyRole, groupMode, permissions, role } = identity;
  const scope = await buildDataAccessScope(adminSupabase, user.id, {
    profile: {
      id: user.id,
      // Scope resolution consumes the canonical profile role. The runtime
      // role is kept on PermissionCore for legacy callers and must not be
      // compared with companyRole as if it were the raw profile.role.
      role: companyRole,
      permissions,
      data_scope: null,
      team_id: profile.team_id ?? null,
      company_role: companyRole,
      group_mode: groupMode,
      group_mode_token_hash: groupModeState.tokenHash ?? undefined,
      membership_status: profile.membership_status,
    },
  });
  if (!scope) return null;

  return {
    userId: user.id,
    name: profile.name ?? null,
    role,
    permissions,
    dataScope: scope.kind,
    teamId: profile.team_id ?? null,
    companyRole,
    membershipStatus: "active",
    groupMode,
    groupModeTokenHash: groupModeState.tokenHash ?? undefined,
    hasGroupOwnerQualification: canEnterGroupMode(companyRole, profile.membership_status),
    scope,
    supabase,
  };
});

/** Shared identity, capability, and data-scope resolver for pages and APIs. */
export async function resolvePermissionCore(): Promise<PermissionCore | null> {
  return loadPermissionCore();
}

export function permissionInfoFromCore(core: PermissionCore): UserPermissionInfo {
  return {
    userId: core.userId,
    name: core.name,
    role: core.role,
    permissions: core.permissions,
    dataScope: core.dataScope,
    teamId: core.teamId,
    companyRole: core.companyRole,
    membershipStatus: core.membershipStatus,
    groupMode: core.groupMode,
    groupModeTokenHash: core.groupModeTokenHash,
    hasGroupOwnerQualification: core.hasGroupOwnerQualification,
  };
}

async function resolveCurrentPermissionContext(
  perspective: "company" | "team" = "company",
  teamId: string | null = null,
): Promise<CurrentPermissionContext | null> {
  const core = await resolvePermissionCore();
  if (!core) return null;

  const permissionInfo = permissionInfoFromCore(core);
  return perspective === "company" && teamId === null
    ? { permissionInfo, scope: core.scope }
    : await buildPermissionContextFromPermissionInfo(permissionInfo, { perspective, teamId });
}

export const getCurrentPermissionContext = cache(resolveCurrentPermissionContext);

export async function buildPermissionContextFromPermissionInfo(
  permissionInfo: UserPermissionInfo,
  options: {
    perspective?: "company" | "team";
    teamId?: string | null;
  } = {},
): Promise<CurrentPermissionContext | null> {
  const teamId = options.teamId ?? null;

  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, permissionInfo.userId, {
    teamId,
    profile: {
      id: permissionInfo.userId,
      // `role` is the legacy runtime representation (company_owner becomes
      // admin). Scope resolution must receive the canonical company role so
      // it does not mistake that compatibility value for a conflicting raw
      // profile role.
      role: permissionInfo.companyRole ?? permissionInfo.role,
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
