import { createClient } from "@/lib/supabase/server";
import { resolveDataScope } from "@/lib/data-access-scope";
import { fixedPermissions, hasCompanyPermission } from "@/lib/permission-utils";
import { toBoolean, toObject, toTrimmedString } from "@/lib/type-guards";
import { resolveCompanyRole, runtimeRoleForCompanyRole } from "@/lib/company-permissions";
import { resolveGroupModeForUser } from "@/lib/group-mode-server";
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

  const [primaryResult, groupModeState] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, role, company_role, permissions, data_scope, membership_status, team_id")
      .eq("id", user.id)
      .single(),
    resolveGroupModeForUser(user.id),
  ]);
  const primary = primaryResult;

  let profile: {
    id: string;
    name: string | null;
    role: UserRole | null;
    company_role?: CompanyRole | string | null;
    permissions: Permissions | null;
    data_scope?: DataScope | null;
    membership_status?: "active" | "archived" | string | null;
    team_id: string | null;
  } | null;

  if (!primary.error) {
    profile = primary.data as typeof profile;
  } else if (
    primary.error.message.includes("data_scope")
    || primary.error.message.includes("company_role")
    || primary.error.message.includes("membership_status")
    || primary.error.message.includes("Could not find")
  ) {
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

  const companyRole = resolveCompanyRole(profile.company_role ?? profile.role);
  if (!companyRole) return { error: "无权限", status: 403 as const };
  if (profile.membership_status === "archived") {
    return { error: "无权限", status: 403 as const };
  }

  const groupMode = groupModeState.active;
  const role = runtimeRoleForCompanyRole(companyRole);
  const permissions = fixedPermissionsForActor(companyRole, profile.permissions, groupMode);
  const allowed = options.requiredPermission
    ? hasCompanyPermission(companyRole, options.requiredPermission, groupMode)
    : Object.values(permissions).some((value) => value === true);

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
        companyRole,
        groupMode,
      ),
      teamId: profile.team_id ?? null,
      companyRole,
      groupMode,
      groupModeTokenHash: groupModeState.tokenHash ?? undefined,
      membershipStatus: "active",
    },
  };
}

function fixedPermissionsForActor(
  companyRole: CompanyRole,
  legacyPermissions: Permissions | null | undefined,
  groupMode: boolean,
) {
  return fixedPermissions(companyRole, legacyPermissions, groupMode);
}

export function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}
