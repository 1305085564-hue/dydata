import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataAccessScope } from "@/lib/data-access-scope";

export async function loadTopicsTeamScope(
  supabase: SupabaseClient,
  baseScope: DataAccessScope,
  teamId: string,
  actorId: string,
): Promise<DataAccessScope> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, membership_status")
    .eq("team_id", teamId);
  if (error) throw new Error("团队成员范围加载失败");

  const rows = (data ?? []) as Array<{ id?: unknown; membership_status?: unknown }>;
  const ids = rows
    .flatMap((row) => typeof row.id === "string" ? [row.id] : []);
  const activeIds = rows
    .flatMap((row) => row.membership_status === "active" && typeof row.id === "string" ? [row.id] : []);
  if (!ids.includes(actorId)) ids.push(actorId);
  if (!activeIds.includes(actorId)) activeIds.push(actorId);
  return {
    ...baseScope,
    teamId,
    kind: "team",
    visibleUserIds: ids,
    activeVisibleUserIds: activeIds,
    groupMode: false,
  };
}
