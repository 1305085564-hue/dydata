import { createClient } from "@/lib/supabase/server";
import { resolveDataScope } from "@/lib/data-access-scope";
import { hasAnyPermission, hasPermission } from "@/lib/permission-utils";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import type { DataScope, PermissionKey, Permissions, UserRole } from "@/types";

export { toBoolean, toObject, toTrimmedString };

export type AdminActor = {
  userId: string;
  role: UserRole;
  permissions: Permissions;
  name: string | null;
  dataScope: DataScope;
  teamId?: string | null;
};

type RequireAdminActorOptions = {
  requiredPermission?: PermissionKey;
};

export type RequireAdminActorError =
  | { error: "未登录"; status: 401 }
  | { error: "用户信息不存在" | "无权限"; status: 403 };

export type RequireAdminActorSuccess = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actor: AdminActor;
};

export type RequireAdminActorResult = RequireAdminActorError | RequireAdminActorSuccess;

export async function requireAdminActor(options: RequireAdminActorOptions = {}): Promise<RequireAdminActorResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "未登录", status: 401 as const };
  }

  const primary = await supabase
    .from("profiles")
    .select("id, name, role, permissions, data_scope, team_id")
    .eq("id", user.id)
    .single();

  let profile: {
    id: string;
    name: string | null;
    role: UserRole | null;
    permissions: Permissions | null;
    data_scope?: DataScope | null;
    team_id: string | null;
  } | null;

  if (!primary.error) {
    profile = primary.data as typeof profile;
  } else if (primary.error.message.includes("data_scope") || primary.error.message.includes("Could not find")) {
    const fallback = await supabase
      .from("profiles")
      .select("id, name, role, permissions, team_id")
      .eq("id", user.id)
      .single();
    if (fallback.error || !fallback.data) {
      return { error: "用户信息不存在", status: 403 as const };
    }
    profile = fallback.data as typeof profile;
  } else {
    return { error: "用户信息不存在", status: 403 as const };
  }

  if (!profile) {
    return { error: "用户信息不存在", status: 403 as const };
  }

  const role = profile.role as UserRole;
  const permissions = (profile.permissions ?? {}) as Permissions;
  const allowed = options.requiredPermission
    ? hasPermission(role, permissions, options.requiredPermission)
    : hasAnyPermission(role, permissions);

  if (!allowed) {
    return { error: "无权限", status: 403 as const };
  }

  return {
    supabase,
    actor: {
      userId: profile.id,
      role,
      permissions,
      name: profile.name ?? null,
      dataScope: resolveDataScope(
        role,
        profile.data_scope as DataScope | null | undefined,
        permissions,
      ),
      teamId: profile.team_id ?? null,
    },
  };
}

export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
