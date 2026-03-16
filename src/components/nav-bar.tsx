import { createClient } from "@/lib/supabase/server";
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

  return (
    <NavBarClient
      name={profile?.name ?? user.email ?? ""}
      isAdmin={profile?.role === "admin" || profile?.role === "owner"}
    />
  );
}
