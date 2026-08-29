import { getNavigationAccess } from "@/lib/analytics-access";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { hasPermission } from "@/lib/permission-utils";
import { getUserPermissions } from "@/lib/permissions";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { loadOrphanExemptionCount } from "@/lib/exemption-orphan";
import { createAdminClient } from "@/lib/supabase/admin";
import { NavBarClient } from "./nav-bar-client";

export async function NavBar() {
  const { supabase, user, authError } = await getCurrentUserContext();
  // auth 失败（token 过期等）按未登录处理，不抛异常
  if (authError || !user) return null;

  const [profileResult, permissionInfo, accountsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, role, permissions")
      .eq("id", user.id)
      .single(),
    getUserPermissions(),
    supabase
      .from("accounts")
      .select("id, name, content_direction, remark")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  const profile = profileResult.data;
  const accounts = accountsResult.data;
  const role = permissionInfo?.role ?? profile?.role ?? "member";
  const permissions = permissionInfo?.permissions ?? {};
  const navigation = getNavigationAccess(role, permissions);
  const showAiCopywriting = hasPermission(role, permissions, "use_ai_copy");
  const showSystemSettings = hasPermission(role, permissions, "manage_system");
  const canAccessTeamManagement = canAccessAdminPath("/admin/modules", role, permissions);

  let orphanExemptionCount = 0;
  if (navigation.showAdmin && permissionInfo) {
    try {
      const adminSupabase = createAdminClient();
      const scope = await buildDataAccessScope(adminSupabase, user.id, {
        profile: {
          id: permissionInfo.userId,
          role: permissionInfo.role,
          permissions: permissionInfo.permissions,
          data_scope: permissionInfo.dataScope,
          team_id: permissionInfo.teamId,
          company_role: permissionInfo.companyRole,
          group_mode: permissionInfo.groupMode,
          group_mode_token_hash: permissionInfo.groupModeTokenHash,
          membership_status: permissionInfo.membershipStatus,
        },
      });
      if (scope) {
        orphanExemptionCount = await loadOrphanExemptionCount({
          supabase: adminSupabase,
          scope,
        });
      }
    } catch {
      console.error("[nav] failed to load orphan exemption count");
    }
  }

  const displayAccounts = (accounts ?? []).map((account, index, list) => ({
    id: account.id,
    name: account.name,
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName: profile?.name ?? user.email ?? "",
      contentDirection: account.content_direction,
      index,
      total: list.length,
      remark: account.remark,
    }),
    content_direction: account.content_direction,
    remark: account.remark,
  }));

  return (
    <NavBarClient
      name={profile?.name ?? user.email ?? ""}
      role={role}
      permissions={permissions}
      showAdmin={navigation.showAdmin}
      showAiCopywriting={showAiCopywriting}
      showSystemSettings={showSystemSettings}
      canAccessTeamManagement={canAccessTeamManagement}
      canEnterGroupMode={permissionInfo?.hasGroupOwnerQualification === true}
      groupModeActive={permissionInfo?.groupMode === true}
      canViewOrphanDetails={
        permissionInfo?.companyRole === "company_owner" || role === "owner"
      }
      orphanExemptionCount={orphanExemptionCount}
      accounts={displayAccounts}
    />
  );
}
