import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { resolveDataScope } from "@/lib/data-access-scope";
import { fixedPermissions, hasAnyPermission, hasPermission } from "@/lib/permission-utils";
import { resolveCompanyRole } from "@/lib/company-permissions";
import type { CompanyRole, DataScope, Permissions, UserRole } from "@/types";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

export interface UserPermissionInfo {
  userId: string;
  name: string | null;
  role: UserRole;
  permissions: Permissions;
  dataScope: DataScope;
  teamId: string | null;
  companyRole?: CompanyRole;
  membershipStatus?: "active" | "archived";
  groupMode?: boolean;
}

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const msg = error.message ?? "";
  return msg.includes("Could not find") || msg.includes("column");
}

function isNotFoundError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST116" || (error.message ? error.message.includes("multiple (or no) rows returned") : false);
}

interface RawProfileRow {
  id: string;
  name: string | null;
  role: UserRole | null;
  company_role?: CompanyRole | string | null;
  permissions: Permissions | null;
  data_scope?: DataScope | null;
  membership_status?: "active" | "archived" | string | null;
  team_id: string | null;
}

const loadUserPermissions = cache(async (): Promise<UserPermissionInfo | null> => {
  const { user, authError } = await getCurrentUserContext();
  if (authError || !user) return null;

  const adminSupabase = createAdminClient();
  const primary = await adminSupabase
    .from("profiles")
    .select("id, name, role, permissions, data_scope, membership_status, team_id")
    .eq("id", user.id)
    .single();

  let profile: RawProfileRow | null = null;
  let dataScope: DataScope = "self";

  if (!primary.error && primary.data) {
    profile = primary.data as unknown as RawProfileRow;
    dataScope = resolveDataScope(
      profile.role,
      profile.data_scope as DataScope | null | undefined,
      profile.permissions,
      profile.company_role,
    );
  } else if (isNotFoundError(primary.error)) {
    return null;
  } else if (isMissingColumnError(primary.error)) {
    // 降级查询基础核心字段
    const fallback = await adminSupabase
      .from("profiles")
      .select("id, name, role, permissions, team_id")
      .eq("id", user.id)
      .single();

    if (fallback.error) {
      if (isNotFoundError(fallback.error)) return null;
      assertSupabaseQuerySucceeded(fallback.error, "加载用户权限失败");
    }
    if (fallback.data) {
      profile = fallback.data as unknown as RawProfileRow;
      dataScope = resolveDataScope(profile.role, null, profile.permissions);
    }
  } else {
    assertSupabaseQuerySucceeded(primary.error, "加载用户权限失败");
  }



  if (!profile) return null;

  const companyRole = resolveCompanyRole(profile.company_role ?? profile.role);
  if (!companyRole) return null;
  const role = companyRole === "company_owner" ? "owner" : companyRole;
  const permissions = fixedPermissions(companyRole, profile.permissions, false);

  return {
    userId: user.id,
    name: profile.name ?? null,
    role,
    permissions,
    dataScope,
    teamId: profile.team_id ?? null,
    companyRole,
    membershipStatus: profile.membership_status === "archived" ? "archived" : "active",
    groupMode: false,
  };
});

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  return loadUserPermissions();
}

export { hasAnyPermission, hasPermission };
