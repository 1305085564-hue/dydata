import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";

export async function requireAdminModulesAccess() {
  const context = await getCurrentPermissionContext();
  if (!context) return { ok: false as const, status: 401, error: "未登录" };

  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/modules", permissionInfo.businessRole, permissionInfo.permissions)) {
    return { ok: false as const, status: 403, error: "无权限" };
  }

  return {
    ok: true as const,
    userId: permissionInfo.userId,
    visibleUserIds: scope.visibleUserIds,
    canViewAllUsers: scope.kind === "all",
  };
}
