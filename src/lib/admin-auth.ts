import { resolvePermissionCore } from "@/lib/current-permission-context";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import type {
  RequireAdminActorOptions,
  RequireAdminActorResult,
} from "@/lib/admin-auth-contract";

export { toBoolean, toObject, toTrimmedString };

export async function requireAdminActor(options: RequireAdminActorOptions = {}): Promise<RequireAdminActorResult> {
  const { user, authError } = await getCurrentUserContext();
  if (authError || !user) return { error: "未登录", status: 401 as const };

  const core = await resolvePermissionCore();
  if (!core) return { error: "无权限", status: 403 as const };

  const allowed = options.requiredPermission
    ? core.permissions[options.requiredPermission] === true
    : Object.values(core.permissions).some((value) => value === true);

  if (!allowed) {
    return { error: "无权限", status: 403 as const };
  }

  return {
    supabase: core.supabase,
    actor: {
      userId: core.userId,
      role: core.role,
      permissions: core.permissions,
      name: core.name,
      dataScope: core.dataScope,
      teamId: core.teamId,
      companyRole: core.companyRole,
      groupMode: core.groupMode,
      groupModeTokenHash: core.groupModeTokenHash,
      membershipStatus: core.membershipStatus,
      activeVisibleUserIds: core.scope.activeVisibleUserIds ?? [],
    },
  };
}

export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
