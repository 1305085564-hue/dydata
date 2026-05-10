import { createAdminClient } from "@/lib/supabase/admin";

// 扩展位：未来组长权限生效后，UI/查询层直接调用此函数取可见团队范围。本期仅预留，不改变既有查询。
export async function getViewableTeamIds(profileId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, permissions")
    .eq("id", profileId)
    .maybeSingle();

  const permissions = profile?.permissions;
  const canViewAllTeams =
    typeof permissions === "object" &&
    permissions !== null &&
    "can_view_all_teams" in permissions &&
    permissions.can_view_all_teams === true;

  if (canViewAllTeams) {
    const { data: teams } = await supabase.from("teams").select("id");
    return (teams ?? []).map((team) => team.id).filter((teamId): teamId is string => typeof teamId === "string");
  }

  return typeof profile?.team_id === "string" && profile.team_id.length > 0 ? [profile.team_id] : [];
}
