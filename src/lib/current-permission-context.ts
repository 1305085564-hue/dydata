import { cache } from "react";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import type { AdminActor } from "@/app/api/admin/auth-helper";
import { getUserPermissions, type UserPermissionInfo } from "@/lib/permissions";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { createAdminClient } from "@/lib/supabase/admin";

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

async function resolveCurrentPermissionContext(
  perspective: "company" | "team" = "company",
  teamId: string | null = null,
): Promise<CurrentPermissionContext | null> {
  const { user, authError } = await getCurrentUserContext();
  if (authError || !user) return null;
  const cacheKey = `${user.id}|${perspective}|${teamId ?? ""}`;
  const cached = permissionContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) return null;
  const context = await buildPermissionContextFromPermissionInfo(permissionInfo, { perspective, teamId });
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
