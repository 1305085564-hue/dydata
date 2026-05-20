import { createClient } from "@/lib/supabase/server";
import { getNavigationAccess } from "@/lib/analytics-access";
import { canUseAiCopywriting } from "@/lib/permission-utils";
import { getUserPermissions } from "@/lib/permissions";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { NavBarClient } from "./nav-bar-client";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, permissions")
    .eq("id", user.id)
    .single();

  const permissionInfo = await getUserPermissions();
  const role = permissionInfo?.role ?? profile?.role ?? "member";
  const businessRole = permissionInfo?.businessRole ?? role;
  const permissions = permissionInfo?.permissions ?? {};
  const navigation = getNavigationAccess(businessRole, permissions);
  const showAiCopywriting = canUseAiCopywriting(businessRole, permissions);
  const showSystemSettings = businessRole === "owner";

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  const displayAccounts = (accounts ?? []).map((account, index, list) => ({
    id: account.id,
    name: account.name,
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName: profile?.name ?? user.email ?? "",
      contentDirection: account.content_direction,
      index,
      total: list.length,
    }),
    content_direction: account.content_direction,
  }));

  return (
    <NavBarClient
      name={profile?.name ?? user.email ?? ""}
      role={role}
      showAdmin={navigation.showAdmin}
      showAiCopywriting={showAiCopywriting}
      showSystemSettings={showSystemSettings}
      accounts={displayAccounts}
    />
  );
}
