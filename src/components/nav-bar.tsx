import { createClient } from "@/lib/supabase/server";
import { getNavigationAccess } from "@/lib/analytics-access";
import { canUseAiCopywriting } from "@/lib/permission-utils";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import type { Permissions } from "@/types";
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

  const role = profile?.role ?? "member";
  const permissions = (profile?.permissions ?? {}) as Permissions;
  const navigation = getNavigationAccess(role);
  const showAiCopywriting = canUseAiCopywriting(role, permissions);

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
      accounts={displayAccounts}
    />
  );
}
