import type { resolvePermissionCore } from "@/lib/current-permission-context";
import type { CompanyRole, DataScope, PermissionKey, Permissions, UserRole } from "@/types";

/**
 * 跨层共享的管理端鉴权契约类型。
 * 只放类型，不引入任何页面组件、server action 或查询实现，供 src/lib 与 src/app 双向复用。
 */
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
  activeVisibleUserIds?: string[];
};

export type RequireAdminActorOptions = {
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
