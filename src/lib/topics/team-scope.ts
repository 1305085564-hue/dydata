import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyVisibleRows, type DataAccessScope } from "@/lib/data-access-scope";
import { filterActiveMemberships } from "@/lib/member-lifecycle";

export async function loadTopicsTeamScope(
  supabase: SupabaseClient,
  baseScope: DataAccessScope,
  teamId: string,
  actorId: string,
): Promise<DataAccessScope> {
  const rows = await loadCompanyVisibleRows(supabase, teamId);
  const ids = rows.map((row) => row.id);
  const activeIds = filterActiveMemberships(rows).map((row) => row.id);
  if (!ids.includes(actorId)) ids.push(actorId);
  if (!activeIds.includes(actorId)) activeIds.push(actorId);
  return {
    ...baseScope,
    teamId,
    kind: "team",
    visibleUserIds: ids,
    activeVisibleUserIds: activeIds,
  };
}
