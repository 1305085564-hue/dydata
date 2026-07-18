import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_TEAM_NAME = "深圳二部";

export interface TeamOption {
  id: string;
  name: string;
}

export async function ensureDefaultTeam() {
  const adminSupabase = createAdminClient();
  const { data: existing, error: existingError } = await adminSupabase
    .from("teams")
    .select("id, name")
    .eq("name", DEFAULT_TEAM_NAME)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing as TeamOption;
  }

  const { data, error } = await adminSupabase
    .from("teams")
    .insert({ name: DEFAULT_TEAM_NAME })
    .select("id, name")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as TeamOption;
}

export async function getTeamOptions() {
  const adminSupabase = createAdminClient();
  return loadTeamOptions(adminSupabase);
}

export async function loadTeamOptions(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await adminSupabase
    .from("teams")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const seen = new Set<string>();
  const teams = ((data ?? []) as TeamOption[]).filter((team) => {
    if (seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });

  return teams;
}

export function getTeamMeta(userMetadata: Record<string, unknown> | undefined | null) {
  const teamId =
    typeof userMetadata?.team_id === "string" && userMetadata.team_id.trim()
      ? userMetadata.team_id.trim()
      : null;
  const teamName =
    typeof userMetadata?.team_name === "string" && userMetadata.team_name.trim()
      ? userMetadata.team_name.trim()
      : DEFAULT_TEAM_NAME;

  return {
    teamId,
    teamName,
  };
}
