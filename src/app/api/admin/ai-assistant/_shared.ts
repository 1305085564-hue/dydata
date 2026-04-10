import { createClient } from "@/lib/supabase/server";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import type { Permissions, UserRole } from "@/types";

export { toBoolean, toObject, toTrimmedString };

export type AdminActor = {
  userId: string;
  role: UserRole;
  permissions: Permissions;
  name: string | null;
};

export async function requireAdminActor() {
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

  if (profile.role !== "admin" && profile.role !== "owner") {
    return { error: "无权限", status: 403 as const };
  }

  return {
    supabase,
    actor: {
      userId: profile.id,
      role: profile.role as UserRole,
      permissions: (profile.permissions ?? {}) as Permissions,
      name: profile.name ?? null,
    } satisfies AdminActor,
  };
}


export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
