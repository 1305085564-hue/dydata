import { canAccessSystemSettings, getNavigationAccess } from "@/lib/analytics-access";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { canUseAiCopywriting } from "@/lib/permission-utils";
import { getUserPermissions } from "@/lib/permissions";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
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
  const businessRole = permissionInfo?.businessRole ?? role;
  const permissions = permissionInfo?.permissions ?? {};
  const navigation = getNavigationAccess(businessRole, permissions);
  const showAiCopywriting = canUseAiCopywriting(businessRole, permissions);
  const showSystemSettings = canAccessSystemSettings(businessRole, permissions);

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
      businessRole={businessRole}
      permissions={permissions}
      showAdmin={navigation.showAdmin}
      showAiCopywriting={showAiCopywriting}
      showSystemSettings={showSystemSettings}
      accounts={displayAccounts}
    />
  );
}
