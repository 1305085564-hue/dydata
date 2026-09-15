import { resolvePermissionCore } from "@/lib/current-permission-context";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import type { CompanyRole, DataScope, PermissionKey, Permissions, UserRole } from "@/types";

export { toBoolean, toObject, toTrimmedString };

export type AdminActor = {
  userId: string;
  role: UserRole;
  permissions: Permissions;
  name: string | null;
  dataScope: DataScope;
  teamId?: string | null;
  companyRole?: CompanyRole;
  groupMode?: boolean;
  groupModeTokenHash?: string;
  membershipStatus?: "active" | "archived";
};

type RequireAdminActorOptions = {
  requiredPermission?: PermissionKey;
};

export type RequireAdminActorError =
  | { error: "未登录"; status: 401 }
  | { error: "用户信息不存在" | "无权限"; status: 403 };

export type RequireAdminActorSuccess = {
  supabase: NonNullable<Awaited<ReturnType<typeof resolvePermissionCore>>>["supabase"];
  actor: AdminActor;
};

export type RequireAdminActorResult = RequireAdminActorError | RequireAdminActorSuccess;

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
    },
  };
}

export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
