import { cache } from "react";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import type { AdminActor } from "@/app/api/admin/auth-helper";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canEnterGroupMode,
  fixedPermissionsForRole,
  resolveCompanyRole,
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

// 权限上下文跨请求短 TTL 缓存：省掉每次 API 串行重建身份+范围的 ~0.5-0.7s（2026-08-30 实测）。
// 命中前仍需 auth.getUser 确认当前用户身份（~0.12s），但跳过 getUserPermissions 与范围构建。
// 安全边界：写路径（成员生命周期、权限工具、分组模式）必须调用 invalidatePermissionContextCache；
// 漏掉失效点时最坏 30s 内读到旧范围。总纲"标准改法 4"的变体。
const PERMISSION_CONTEXT_TTL_MS = 30_000;
const permissionContextCache = new Map<string, { value: CurrentPermissionContext; expiresAt: number }>();

export function invalidatePermissionContextCache() {
  permissionContextCache.clear();
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

  const companyRole = resolveCompanyRole(profile.company_role ?? profile.role);
  if (!companyRole) return null;

  const groupMode = requestedGroupMode
    && canEnterGroupMode(companyRole, profile.membership_status);
  const role = runtimeRoleForCompanyRole(companyRole);

  return {
    companyRole,
    membershipStatus: "active" as const,
    groupMode,
    role,
    permissions: fixedPermissionsForRole(companyRole, null, groupMode),
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
      role,
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
  const cacheKey = `${core.userId}|${perspective}|${teamId ?? ""}`;
  const cached = permissionContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const permissionInfo = permissionInfoFromCore(core);
  const context = perspective === "company" && teamId === null
    ? { permissionInfo, scope: core.scope }
    : await buildPermissionContextFromPermissionInfo(permissionInfo, { perspective, teamId });
  if (context) {
    permissionContextCache.set(cacheKey, { value: context, expiresAt: Date.now() + PERMISSION_CONTEXT_TTL_MS });
  }
  return context;
}

export const getCurrentPermissionContext = cache(resolveCurrentPermissionContext);

export async function buildPermissionContextFromPermissionInfo(
  permissionInfo: UserPermissionInfo,
  options: {
    perspective?: "company" | "team";
    teamId?: string | null;
  } = {},
): Promise<CurrentPermissionContext | null> {
  const perspective = options.perspective ?? "company";
  const teamId = options.teamId ?? null;
  // scope 构建缓存：覆盖 requireAdminActor + buildPermissionContextForActor 路径，
  // 与上方整体缓存同一 TTL 与失效策略
  const scopeCacheKey = `${permissionInfo.userId}|${perspective}|${teamId ?? ""}`;
  const cachedScope = permissionContextCache.get(scopeCacheKey);
  if (cachedScope && cachedScope.expiresAt > Date.now()) {
    return { permissionInfo, scope: cachedScope.value.scope };
  }

  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, permissionInfo.userId, {
    teamId,
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

  permissionContextCache.set(scopeCacheKey, { value: { permissionInfo, scope }, expiresAt: Date.now() + PERMISSION_CONTEXT_TTL_MS });
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
