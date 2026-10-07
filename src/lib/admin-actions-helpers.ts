import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamMeta } from "@/lib/teams";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { UserPermissionInfo } from "@/lib/current-permission-context";
import type { UserRole } from "@/types";

export const SAFE_EXEMPTION_REQUEST_INPUT_ERRORS = new Set([
  "多日豁免必须填写开始和结束日期",
  "开始日期不能晚于结束日期",
  "豁免至少选择1天",
  "永久豁免必须填写原因",
  "豁免理由不能超过 500 个字符",
]);

export function hasActiveScopeAccess(scope: DataAccessScope | null, userId: string) {
  if (!scope) return false;
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  return activeVisibleUserIds.includes(userId);
}

export function resolveTargetRuntimeRole(profile: { role?: unknown; company_role?: unknown }): UserRole | null {
  const resolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (resolution.conflict || !resolution.companyRole) return null;
  return resolution.companyRole === "company_owner" ? "owner" : resolution.companyRole;
}

export async function getProfileTeamId(
  _supabase: SupabaseClient,
  userId: string,
) {
  const adminSupabase = createAdminClient();
  const profileResult = await adminSupabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profileResult.error && profileResult.data) {
    return profileResult.data.team_id ?? null;
  }

  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message);
  }

  return getTeamMeta(data.user?.user_metadata).teamId;
}

export async function getTeamNameMap(
  adminSupabase: ReturnType<typeof createAdminClient>,
  teamIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(teamIds.filter((teamId): teamId is string => Boolean(teamId))));
  if (ids.length === 0) return new Map<string, string>(); // gate:transient-map per-call team-name lookup

  const { data, error } = await adminSupabase
    .from("teams")
    .select("id, name")
    .in("id", ids);
  if (error) return new Map<string, string>(); // gate:transient-map per-call team-name lookup

  return new Map((data ?? []).map((team) => [team.id as string, team.name as string])); // gate:transient-map per-call team-name lookup
}

export function formatTeamName(teamId: string | null, teamNames: Map<string, string>) {
  if (!teamId) return "未分配";
  return teamNames.get(teamId) ?? teamId;
}

export function normalizeOrphanActionValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type OrphanMutationContext = {
  perm: UserPermissionInfo;
  supabase: SupabaseClient;
  adminSupabase: ReturnType<typeof createAdminClient>;
  scope: DataAccessScope;
  request: {
    id: string;
    applicant_user_id: string | null;
    team_id: string | null;
    request_status: string | null;
  };
  applicant: {
    id: string;
    team_id: string | null;
    membership_status: string | null;
  } | null;
};
