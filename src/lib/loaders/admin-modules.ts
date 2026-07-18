import type { DataManager } from "@/app/(app)/admin/data-manager";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { loadProfilesWithExemptionFallback } from "@/app/(app)/admin/资料加载";
import { normalizePermissionsForBusinessRole, resolveBusinessRole } from "@/lib/business-role";
import type { BusinessRole } from "@/lib/business-role";
import {
  buildAdminModuleMemberSummaries,
  hydrateAdminModuleMemberEmails,
  type AdminModuleMemberHydration,
  type AdminModuleMemberProfileLike,
  type AdminModuleMemberSummary,
} from "@/lib/admin-modules-contract";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  filterVisibleTeamManagementProfiles,
  filterUsableLeaderCandidates,
  resolveTeamManagementAccess,
  type TeamManagementAccess,
  type TeamManagementGroup,
  type TeamManagementProfile,
} from "@/lib/team-management";
import { getTeamOptions } from "@/lib/teams";
import type { Permissions, UserRole } from "@/types";

import { shiftDateOnly } from "./shared";

type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

type AdminModuleProfileRow = AdminModuleMemberProfileLike & {
  created_at?: string | null;
};

export interface AdminModulesData {
  currentUserId: string;
  queryDate: string;
  perm: { role: UserRole; businessRole: BusinessRole; permissions: Permissions };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  allProfiles: AdminModuleMemberSummary[];
  teams: Array<{ id: string; name: string }>;
  teamManagement: {
    access: TeamManagementAccess;
    teams: Array<{ id: string; name: string }>;
    groups: TeamManagementGroup[];
    profiles: TeamManagementProfile[];
    leaderCandidates: TeamManagementProfile[];
  };
}

export type AdminModulesTeamManagementData = AdminModulesData["teamManagement"];

export {
  buildAdminModuleMemberSummaries,
  hydrateAdminModuleMemberEmails,
};

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

async function loadGovernanceAverages(
  supabase: AdminSupabase,
  queryDate: string,
  visibleUserIds: string[] | null,
) {
  const sevenDaysAgo = shiftDateOnly(new Date(), -7);
  let recentForAvgQuery = supabase
    .from("daily_reports")
    .select("submitter, play_count")
    .gte("report_date", sevenDaysAgo)
    .neq("report_date", queryDate);
  let recentAccountAvgQuery = supabase
    .from("daily_reports")
    .select("account_id, play_count")
    .gte("report_date", sevenDaysAgo)
    .neq("report_date", queryDate);

  if (visibleUserIds !== null) {
    recentForAvgQuery = recentForAvgQuery.in("user_id", visibleUserIds);
    recentAccountAvgQuery = recentAccountAvgQuery.in("user_id", visibleUserIds);
  }

  const [{ data: recentForAvg }, { data: recentAccountAvg }] = await Promise.all([
    recentForAvgQuery,
    recentAccountAvgQuery,
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
  visibleUserIds,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
  visibleUserIds: string[] | null;
}): Promise<AdminGovernanceData | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;

  const queryDate = searchDate || new Date().toISOString().split("T")[0];
  let fullReportsQuery = supabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id, content_direction, presentation_format)"
    )
    .eq("report_date", queryDate);
  if (visibleUserIds !== null) {
    fullReportsQuery = fullReportsQuery.in("user_id", visibleUserIds);
  }

  const [{ data: fullReports }, averages] = await Promise.all([
    fullReportsQuery.order("uploaded_at", { ascending: false }),
    loadGovernanceAverages(supabase, queryDate, visibleUserIds),
  ]);

  return {
    queryDate,
    fullReports: fullReports ?? [],
    ...averages,
  };
}

async function loadAdminModulesBaseContext({
  supabase,
  searchDate,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
}) {
  const perm = await getUserPermissions();
  if (!perm) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    perm,
    user,
    queryDate: searchDate || new Date().toISOString().split("T")[0],
    permissionManagerCapabilities: getPermissionManagerCapabilities(perm.role, perm.permissions, perm.businessRole),
    adminSupabase: createAdminClient(),
  };
}

async function loadAdminModuleProfiles(
  adminSupabase: ReturnType<typeof createAdminClient>,
): Promise<AdminModuleProfileRow[]> {
  const { data: profiles } = await loadProfilesWithExemptionFallback({
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
        .select("id, name, role, status, permissions, team_id, group_id, created_at")
        .order("created_at", { ascending: true }) as never,
  });

  return ((profiles ?? []) as AdminModuleProfileRow[]).map((profile) => ({
    ...profile,
    role: profile.role as UserRole,
    permissions: (profile.permissions ?? {}) as Permissions,
    status: profile.status ?? null,
    team_id: profile.team_id ?? null,
    group_id: profile.group_id ?? null,
  }));
}

async function loadAdminModuleMemberHydrationMap(
  adminSupabase: ReturnType<typeof createAdminClient>,
  teams: Array<{ id: string; name: string }>,
  visibleUserIds: string[] | null = null,
): Promise<Record<string, AdminModuleMemberHydration>> {
  const authUsers = visibleUserIds === null
    ? (await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? []
    : (await Promise.all(
        visibleUserIds.map(async (userId) => {
          const result = await adminSupabase.auth.admin.getUserById(userId);
          return result.data?.user ?? null;
        }),
      )).filter((user): user is NonNullable<typeof user> => Boolean(user));
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return Object.fromEntries(
    authUsers.map((authUser) => {
      const metadata = authUser.user_metadata ?? {};
      const metadataTeamName =
        typeof metadata.team_name === "string" && metadata.team_name.trim()
          ? metadata.team_name.trim()
          : null;
      const metadataTeamId =
        typeof metadata.team_id === "string" && metadata.team_id.trim()
          ? metadata.team_id.trim()
          : null;
      const resolvedTeamId =
        metadataTeamId ?? (metadataTeamName ? (teamIdByName.get(metadataTeamName) ?? null) : null);

      return [
        authUser.id,
        {
          email: authUser.email ?? null,
          team_id: resolvedTeamId,
          team_name: resolvedTeamId ? (teamNameById.get(resolvedTeamId) ?? metadataTeamName ?? null) : (metadataTeamName ?? null),
        },
      ];
    }),
  );
}

function buildAdminModulesTeamManagementPayload({
  perm,
  teams,
  groups,
  allProfiles,
}: {
  perm: { userId: string; role: UserRole; permissions: Permissions };
  teams: Array<{ id: string; name: string }>;
  groups: TeamManagementGroup[];
  allProfiles: AdminModuleMemberSummary[];
}): AdminModulesTeamManagementData {
  const normalizedHydratedProfiles = allProfiles.map((profile) => {
    const businessRole = resolveBusinessRole(profile, groups);
    return {
      ...profile,
      permissions: normalizePermissionsForBusinessRole(businessRole, profile.permissions ?? {}),
    };
  }) as AdminModuleMemberSummary[];
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
  const leaderCandidates = filterUsableLeaderCandidates(
    teamManagementAccess,
    normalizedHydratedProfiles as TeamManagementProfile[],
  );

  return {
    access: teamManagementAccess,
    teams: visibleTeams,
    groups: visibleGroups,
    profiles: visibleTeamManagementProfiles,
    leaderCandidates,
  };
}

export async function loadAdminModuleMemberEmailHydration(
  visibleUserIds: string[] | null,
): Promise<Record<string, AdminModuleMemberHydration> | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;
  const adminSupabase = createAdminClient();
  const teams = await getTeamOptions();
  return loadAdminModuleMemberHydrationMap(adminSupabase, teams, visibleUserIds);
}

export async function loadAdminModulesTeamManagementData(): Promise<AdminModulesTeamManagementData | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;

  const adminSupabase = createAdminClient();
  const teams = await getTeamOptions();
  const [profiles, groupsResult, hydrationMap] = await Promise.all([
    loadAdminModuleProfiles(adminSupabase),
    adminSupabase
      .from("groups")
      .select("id, name, team_id, leader_user_id")
      .order("name", { ascending: true }),
    loadAdminModuleMemberHydrationMap(adminSupabase, teams),
  ]);
  const groups = ((groupsResult.data ?? []) as TeamManagementGroup[]).map((group) => ({
    id: group.id,
    name: group.name,
    team_id: group.team_id ?? null,
    leader_user_id: group.leader_user_id ?? null,
  }));

  return buildAdminModulesTeamManagementPayload({
    perm,
    teams,
    groups,
    allProfiles: hydrateAdminModuleMemberEmails(buildAdminModuleMemberSummaries(profiles, teams), hydrationMap),
  });
}

export async function loadAdminModulesData({
  supabase,
  searchDate,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
}): Promise<AdminModulesData | null> {
  const context = await loadAdminModulesBaseContext({ supabase, searchDate });
  if (!context) return null;

  const teams = await getTeamOptions();
  const [profiles, groupsResult, hydrationMap] = await Promise.all([
    loadAdminModuleProfiles(context.adminSupabase),
    context.adminSupabase
      .from("groups")
      .select("id, name, team_id, leader_user_id")
      .order("name", { ascending: true }),
    loadAdminModuleMemberHydrationMap(context.adminSupabase, teams),
  ]);
  const groups = ((groupsResult.data ?? []) as TeamManagementGroup[]).map((group) => ({
    id: group.id,
    name: group.name,
    team_id: group.team_id ?? null,
    leader_user_id: group.leader_user_id ?? null,
  }));
  const hydratedAllProfiles = hydrateAdminModuleMemberEmails(
    buildAdminModuleMemberSummaries(profiles, teams),
    hydrationMap,
  );

  return {
    currentUserId: context.user.id,
    queryDate: context.queryDate,
    perm: {
      role: context.perm.role,
      businessRole: context.perm.businessRole,
      permissions: context.perm.permissions,
    },
    permissionManagerCapabilities: context.permissionManagerCapabilities,
    allProfiles: hydratedAllProfiles,
    teams,
    teamManagement: buildAdminModulesTeamManagementPayload({
      perm: context.perm,
      teams,
      groups,
      allProfiles: hydratedAllProfiles,
    }),
  };
}
