import { createClient } from "@/lib/supabase/server";
import { getNavigationAccess } from "@/lib/analytics-access";
import { NavBarClient } from "./nav-bar-client";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  const navigation = getNavigationAccess(role);

  return (
    <NavBarClient
      name={profile?.name ?? user.email ?? ""}
      showAdmin={navigation.showAdmin}
      showAnalytics={navigation.showAnalytics}
    />
  );
}
