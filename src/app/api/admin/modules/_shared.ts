import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";

export async function requireAdminModulesAccess() {
  const permission = await getUserPermissions();
  if (!permission) return { ok: false as const, status: 401, error: "未登录" };
  if (!canAccessAdminPath("/admin/modules", permission.businessRole, permission.permissions)) {
    return { ok: false as const, status: 403, error: "无权限" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "未登录" };

  return { ok: true as const, userId: user.id };
}
