import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/current-user-context";

export default async function TopicDetailLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, membership_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.membership_status !== "active" || !profile.team_id) {
    redirect("/topics?membership=required");
  }

  return children;
}
