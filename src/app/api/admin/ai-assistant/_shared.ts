import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import type { BusinessRole } from "@/lib/business-role";
import type { PermissionKey, Permissions, UserRole } from "@/types";

export { toBoolean, toObject, toTrimmedString };

export type AdminActor = {
  userId: string;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  name: string | null;
};

type RequireAdminActorOptions = {
  requiredPermission?: PermissionKey;
};

function hasAnyAdminPermission(businessRole: BusinessRole, permissions: Permissions) {
  if (businessRole === "owner" || businessRole === "team_admin" || businessRole === "group_leader") return true;
  return (
    hasPermission(businessRole, permissions, "view_all_data") ||
    hasPermission(businessRole, permissions, "edit_data") ||
    hasPermission(businessRole, permissions, "export_data") ||
    hasPermission(businessRole, permissions, "manage_invite") ||
    hasPermission(businessRole, permissions, "view_analytics") ||
    hasPermission(businessRole, permissions, "view_audit_log") ||
    hasPermission(businessRole, permissions, "manage_members") ||
    hasPermission(businessRole, permissions, "manage_violations") ||
    hasPermission(businessRole, permissions, "use_ai_management")
  );
}

export async function requireAdminActor(options: RequireAdminActorOptions = {}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "未登录", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, name, role, permissions")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return { error: "用户信息不存在", status: 403 as const };
  }

  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) {
    return { error: "用户信息不存在", status: 403 as const };
  }

  const allowed = options.requiredPermission
    ? hasPermission(permissionInfo.businessRole, permissionInfo.permissions, options.requiredPermission)
    : hasAnyAdminPermission(permissionInfo.businessRole, permissionInfo.permissions);

  if (!allowed) {
    return { error: "无权限", status: 403 as const };
  }

  return {
    supabase,
    actor: {
      userId: profile.id,
      role: permissionInfo.role,
      businessRole: permissionInfo.businessRole,
      permissions: permissionInfo.permissions,
      name: profile.name ?? null,
    } satisfies AdminActor,
  };
}


export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
