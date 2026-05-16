import type { DataManager } from "@/app/(app)/admin/data-manager";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { loadProfilesWithExemptionFallback } from "@/app/(app)/admin/资料加载";
import { normalizePermissionsForBusinessRole, resolveBusinessRole } from "@/lib/business-role";
import type { BusinessRole } from "@/lib/business-role";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  filterVisibleTeamManagementProfiles,
  isIgnoredTeamManagementUser,
  resolveTeamManagementAccess,
  type TeamManagementAccess,
  type TeamManagementGroup,
  type TeamManagementProfile,
} from "@/lib/team-management";
import { getTeamMeta, getTeamOptions } from "@/lib/teams";
import type { Permissions, UserRole } from "@/types";

import { shiftDateOnly } from "./shared";

type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

export interface AdminModulesData {
  currentUserId: string;
  queryDate: string;
  perm: { role: UserRole; businessRole: BusinessRole; permissions: Permissions };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  allProfiles: Array<{
    id: string;
    name: string;
    role: UserRole;
    status: string | null;
    permissions: Permissions | null;
    email: string | null;
    team_id?: string | null;
    group_id?: string | null;
    team_name: string | null;
  }>;
  teams: Array<{ id: string; name: string }>;
  teamManagement: {
    access: TeamManagementAccess;
    teams: Array<{ id: string; name: string }>;
    groups: TeamManagementGroup[];
    profiles: TeamManagementProfile[];
    leaderCandidates: TeamManagementProfile[];
  };
}

export interface AdminGovernanceData {
  queryDate: string;
  fullReports: Parameters<typeof DataManager>[0]["reports"];
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
}

export function calculateAverageStats<Row>(
  rows: Row[] | null | undefined,
  getKey: (row: Row) => string | null | undefined,
  getValue: (row: Row) => number | null | undefined,
) {
  const avgByKey: Record<string, number> = {};
  const dayCountByKey: Record<string, number> = {};
  const sums = new Map<string, { total: number; count: number }>();

  for (const row of rows ?? []) {
    const key = getKey(row) ?? "";
    if (!key) continue;

    const current = sums.get(key) ?? { total: 0, count: 0 };
    current.total += getValue(row) ?? 0;
    current.count += 1;
    sums.set(key, current);
  }

  for (const [key, { total, count }] of sums) {
    if (count > 0) avgByKey[key] = Math.round(total / count);
    dayCountByKey[key] = count;
  }

  return { avgByKey, dayCountByKey };
}

async function loadGovernanceAverages(supabase: AdminSupabase, queryDate: string) {
  const sevenDaysAgo = shiftDateOnly(new Date(), -7);
  const [{ data: recentForAvg }, { data: recentAccountAvg }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("submitter, play_count")
      .gte("report_date", sevenDaysAgo)
      .neq("report_date", queryDate),
    supabase
      .from("daily_reports")
      .select("account_id, play_count")
      .gte("report_date", sevenDaysAgo)
      .neq("report_date", queryDate),
  ]);

  const { avgByKey: avgPlayBySubmitter, dayCountByKey: dayCountBySubmitter } = calculateAverageStats(
    recentForAvg,
    (row) => row.submitter,
    (row) => row.play_count,
  );
  const { avgByKey: avgPlayByAccount, dayCountByKey: dayCountByAccount } = calculateAverageStats(
    recentAccountAvg,
    (row) => row.account_id,
    (row) => row.play_count,
  );

  return {
    avgPlayBySubmitter,
    dayCountBySubmitter,
    avgPlayByAccount,
    dayCountByAccount,
  };
}

export async function loadAdminGovernanceData({
  supabase,
  searchDate,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
}): Promise<AdminGovernanceData | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;

  const queryDate = searchDate || new Date().toISOString().split("T")[0];
  const [{ data: fullReports }, averages] = await Promise.all([
    supabase
      .from("daily_reports")
      .select(
        "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id, content_direction, presentation_format)"
      )
      .eq("report_date", queryDate)
      .order("uploaded_at", { ascending: false }),
    loadGovernanceAverages(supabase, queryDate),
  ]);

  return {
    queryDate,
    fullReports: fullReports ?? [],
    ...averages,
  };
}

export async function loadAdminModulesData({
  supabase,
  searchDate,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
}): Promise<AdminModulesData | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const permissionManagerCapabilities = getPermissionManagerCapabilities(perm.role, perm.permissions, perm.businessRole);
  const queryDate = searchDate || new Date().toISOString().split("T")[0];

  const adminSupabase = createAdminClient();
  const { data: allProfiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      adminSupabase
        .from("profiles")
        .select(
          "id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category, permissions, team_id, group_id, created_at"
        )
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, permissions, team_id, created_at")
        .order("created_at", { ascending: true }) as never,
  });

  const [authUsersResult, teams, groupsResult] = await Promise.all([
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    getTeamOptions(),
    adminSupabase
      .from("groups")
      .select("id, name, team_id, leader_user_id")
      .order("name", { ascending: true }),
  ]);
  const authUserById = new Map(
    (authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser]),
  );
  const authEmailByUserId = new Map(
    (authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null]),
  );
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));

  const hydratedAllProfiles = (allProfiles ?? []).map((profile) => {
    const metadata = authUserById.get(profile.id)?.user_metadata ?? {};
    const metadataTeamName = getTeamMeta(metadata).teamName;
    const metadataTeamId = typeof metadata.team_id === "string" ? metadata.team_id : null;
    const dbTeamId = profile.team_id ?? metadataTeamId ?? (metadataTeamName ? teamIdByName.get(metadataTeamName) ?? null : null);
    const dbTeamName = dbTeamId ? (teamNameById.get(dbTeamId) ?? null) : null;

    return {
      ...profile,
      role: profile.role as UserRole,
      team_id: dbTeamId,
      group_id: profile.group_id ?? null,
      email: authEmailByUserId.get(profile.id) ?? null,
      team_name: dbTeamName ?? metadataTeamName,
      permissions: (profile.permissions ?? null) as Permissions | null,
    };
  }) as AdminModulesData["allProfiles"];

  const groups = ((groupsResult.data ?? []) as TeamManagementGroup[]).map((group) => ({
    id: group.id,
    name: group.name,
    team_id: group.team_id ?? null,
    leader_user_id: group.leader_user_id ?? null,
  }));
  const normalizedHydratedProfiles = hydratedAllProfiles.map((profile) => {
    const businessRole = resolveBusinessRole(profile, groups);
    return {
      ...profile,
      permissions: normalizePermissionsForBusinessRole(businessRole, profile.permissions ?? {}),
    };
  }) as AdminModulesData["allProfiles"];
  const actorProfile =
    (normalizedHydratedProfiles.find((profile) => profile.id === perm.userId) as TeamManagementProfile | undefined) ??
    ({
      id: perm.userId,
      name: "",
      role: perm.role,
      permissions: perm.permissions,
      team_id: null,
      group_id: null,
    } satisfies TeamManagementProfile);
  const teamManagementAccess = resolveTeamManagementAccess(actorProfile, groups);
  const visibleTeamManagementProfiles = filterVisibleTeamManagementProfiles(
    teamManagementAccess,
    normalizedHydratedProfiles as TeamManagementProfile[],
    groups,
  );
  const visibleTeamIds =
    teamManagementAccess.teamIds === null
      ? new Set(teams.map((team) => team.id))
      : new Set(teamManagementAccess.teamIds);
  const visibleTeams = teams.filter(
    (team) =>
      visibleTeamIds.has(team.id) ||
      visibleTeamManagementProfiles.some((profile) => profile.team_id === team.id),
  );
  const visibleGroups = groups.filter((group) => {
    if (!teamManagementAccess.canView) return false;
    if (teamManagementAccess.groupIds) return teamManagementAccess.groupIds.includes(group.id);
    if (teamManagementAccess.teamIds === null) return true;
    return Boolean(group.team_id && teamManagementAccess.teamIds.includes(group.team_id));
  });
  const leaderCandidates = (normalizedHydratedProfiles as TeamManagementProfile[])
    .filter((profile) => profile.role === "admin" && profile.permissions?.manage_members !== true)
    .filter((profile) => Boolean(profile.team_id))
    .filter((profile) => !isIgnoredTeamManagementUser(profile));

  return {
    currentUserId: user.id,
    queryDate,
    perm,
    permissionManagerCapabilities,
    allProfiles: normalizedHydratedProfiles,
    teams,
    teamManagement: {
      access: teamManagementAccess,
      teams: visibleTeams,
      groups: visibleGroups,
      profiles: visibleTeamManagementProfiles,
      leaderCandidates,
    },
  };
}
