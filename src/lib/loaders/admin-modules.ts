import type { DataManager } from "@/app/(app)/admin/data-manager";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { isMissingMembershipStatusError, isActiveMembership } from "@/lib/member-lifecycle";
import {
  applyAdminModuleMonthlyPublishStats,
  buildAdminModuleMemberSummaries,
  calculateAdminModuleMonthlyPublishStats,
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
  type TeamManagementProfile,
} from "@/lib/team-management";
import { buildDataAccessScope, inferDataScope } from "@/lib/data-access-scope";
import {
  isCompanyOwnerActor,
  loadOrphanExemptionRequests,
  type OrphanExemptionRequest,
} from "@/lib/exemption-orphan";
import { measureAsync } from "@/lib/perf";
import { getTeamOptions } from "@/lib/teams";
import type { CompanyRole, Permissions, UserRole } from "@/types";

import { shiftDateOnly } from "./shared";

type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

const AUTH_USERS_PAGE_SIZE = 1000;

type AuthAdminUser = Awaited<
  ReturnType<ReturnType<typeof createAdminClient>["auth"]["admin"]["listUsers"]>
>["data"]["users"][number];

/**
 * Auth Admin API 是分页接口；不能只取第一页，否则超过 1000 个账号时邮箱和登录时间会静默缺失。
 * 保留 1000 的单页大小减少请求次数，同时根据 nextPage 继续拉取后续页。
 */
export async function listAllAuthUsers(
  adminSupabase: ReturnType<typeof createAdminClient>,
): Promise<AuthAdminUser[]> {
  const users: AuthAdminUser[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      throw new Error(error.message || "加载 Auth 用户失败");
    }

    users.push(...data.users);

    const nextPage =
      typeof data.nextPage === "number"
        ? data.nextPage
        : data.users.length >= AUTH_USERS_PAGE_SIZE
          ? page + 1
          : null;

    if (!nextPage || nextPage <= page) break;
    page = nextPage;
  }

  return users;
}

type AdminModuleProfileRow = AdminModuleMemberProfileLike & {
  created_at?: string | null;
  membership_status?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
};

export interface AdminModulesData {
  currentUserId: string;
  queryDate: string;
  perm: {
    role: UserRole;
    permissions: Permissions;
    companyRole?: CompanyRole;
    groupMode?: boolean;
    teamId?: string | null;
  };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  allProfiles: AdminModuleMemberSummary[];
  archivedProfiles?: AdminModuleMemberSummary[];
  teams: Array<{ id: string; name: string }>;
  teamManagement: {
    access: TeamManagementAccess;
    teams: Array<{ id: string; name: string }>;
    profiles: TeamManagementProfile[];
    leaderCandidates: TeamManagementProfile[];
  };
  orphanExemptionRequests: OrphanExemptionRequest[];
  orphanExemptionCount: number;
}

export type AdminModulesTeamManagementData = AdminModulesData["teamManagement"];

export {
  applyAdminModuleMonthlyPublishStats,
  buildAdminModuleMemberSummaries,
  calculateAdminModuleMonthlyPublishStats,
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

  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, user.id, {
    profile: {
      id: user.id,
      role: perm.role,
      permissions: perm.permissions,
      data_scope: perm.dataScope,
      team_id: perm.teamId ?? null,
      company_role: perm.companyRole,
      group_mode: perm.groupMode,
      group_mode_token_hash: perm.groupModeTokenHash,
      membership_status: perm.membershipStatus,
    },
  });
  if (!scope) return null;

  return {
    perm,
    user,
    queryDate: searchDate || new Date().toISOString().split("T")[0],
    permissionManagerCapabilities: getPermissionManagerCapabilities(
      perm.role,
      perm.permissions,
      perm.companyRole,
      perm.groupMode,
    ),
    adminSupabase,
    scope,
  };
}

async function loadAdminModuleProfiles(
  adminSupabase: ReturnType<typeof createAdminClient>,
): Promise<AdminModuleProfileRow[]> {
  const baseFields = "id, name, role, status, permissions, data_scope, team_id, created_at";
  const legacyBaseFields = "id, name, role, status, permissions, team_id, created_at";
  const exemptionFields = "exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category";
  const lifecycleFields = "membership_status, archived_at, archived_by, archive_reason, archive_snapshot";
  const variants = [
    `${baseFields}, ${exemptionFields}, ${lifecycleFields}`,
    `${legacyBaseFields}, ${exemptionFields}, ${lifecycleFields}`,
    `${baseFields}, ${lifecycleFields}`,
    `${legacyBaseFields}, ${lifecycleFields}`,
    `${baseFields}, ${exemptionFields}`,
    `${legacyBaseFields}, ${exemptionFields}`,
    baseFields,
    legacyBaseFields,
  ];

  let lastError: { message?: string } | null = null;
  for (const select of variants) {
    const result = await adminSupabase
      .from("profiles")
      .select(select)
      .order("created_at", { ascending: true });

    if (!result.error) {
      return ((result.data ?? []) as unknown as AdminModuleProfileRow[]).map((profile) => ({
        ...profile,
        role: profile.role as UserRole,
        permissions: (profile.permissions ?? {}) as Permissions,
        data_scope: profile.data_scope ?? inferDataScope(profile.role as UserRole, profile.permissions ?? {}),
        status: profile.status ?? null,
        membership_status: profile.membership_status ?? "active",
        archived_at: profile.archived_at ?? null,
        archived_by: profile.archived_by ?? null,
        archive_reason: profile.archive_reason ?? null,
        archive_snapshot: profile.archive_snapshot ?? null,
        team_id: profile.team_id ?? null,
        exempt_type: profile.exempt_type ?? null,
        exempt_start_date: profile.exempt_start_date ?? null,
        exempt_end_date: profile.exempt_end_date ?? null,
        exempt_reason: profile.exempt_reason ?? null,
        exemption_category: profile.exemption_category ?? null,
      }));
    }

    lastError = result.error;
    const knownCompatibilityError =
      isMissingMembershipStatusError(result.error) ||
      [
        "exempt_type",
        "exempt_start_date",
        "exempt_end_date",
        "exempt_reason",
        "exemption_category",
        "team_id",
        "data_scope",
      ].some((column) => result.error?.message?.includes(column));
    if (!knownCompatibilityError) break;
  }

  throw new Error(lastError?.message ?? "加载成员资料失败");
}

async function hydrateArchivedByNames(
  adminSupabase: ReturnType<typeof createAdminClient>,
  profiles: AdminModuleMemberSummary[],
) {
  const ids = Array.from(new Set(
    profiles
      .map((profile) => profile.archived_by)
      .filter((id): id is string => Boolean(id)),
  ));
  if (ids.length === 0) return profiles;

  const result = await adminSupabase.from("profiles").select("id, name").in("id", ids);
  if (result.error) throw new Error(result.error.message ?? "加载归档人信息失败");
  const names = new Map((result.data ?? []).map((profile) => [profile.id as string, profile.name as string | null]));

  return profiles.map((profile) => ({
    ...profile,
    archived_by_name: profile.archived_by ? names.get(profile.archived_by) ?? null : null,
  }));
}

function filterVisibleArchivedProfiles(
  profiles: AdminModuleMemberSummary[],
  access: TeamManagementAccess,
) {
  if (!access.canView) return [];
  if (access.teamIds === null) return profiles;
  if (access.teamIds.length === 0) return [];

  const visibleTeamIds = new Set(access.teamIds);
  return profiles.filter((profile) => {
    const archivedTeamId =
      (profile.archive_snapshot && typeof profile.archive_snapshot.team_id === "string"
        ? profile.archive_snapshot.team_id
        : null) ?? profile.team_id ?? null;
    return Boolean(archivedTeamId && visibleTeamIds.has(archivedTeamId));
  });
}

async function loadAdminModuleMemberHydrationMap(
  adminSupabase: ReturnType<typeof createAdminClient>,
  teams: Array<{ id: string; name: string }>,
  visibleUserIds: string[] | null = null,
): Promise<Record<string, AdminModuleMemberHydration>> {
  // 统一走 listUsers 分页拉取（与全量分支同源），再按需过滤，
  // 避免对 Auth Admin API 做 N 次 getUserById 的无上限并发扇出
  const authUsers = await listAllAuthUsers(adminSupabase);
  const visibleIdSet = visibleUserIds === null ? null : new Set(visibleUserIds);
  const relevantUsers = visibleIdSet === null
    ? authUsers
    : authUsers.filter((authUser) => visibleIdSet.has(authUser.id));
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return Object.fromEntries(
    relevantUsers.map((authUser) => {
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
          last_sign_in_at: authUser.last_sign_in_at ?? null,
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
  allProfiles,
}: {
  perm: {
    userId: string;
    role: UserRole;
    permissions: Permissions;
    companyRole?: CompanyRole;
    groupMode?: boolean;
    teamId?: string | null;
  };
  teams: Array<{ id: string; name: string }>;
  allProfiles: AdminModuleMemberSummary[];
}): AdminModulesTeamManagementData {
  const normalizedHydratedProfiles = allProfiles.map((profile) => ({
    ...profile,
    permissions: profile.permissions ?? {},
  })) as AdminModuleMemberSummary[];
  const actorProfile =
    (normalizedHydratedProfiles.find((profile) => profile.id === perm.userId) as TeamManagementProfile | undefined) ??
    ({
      id: perm.userId,
      name: "",
      role: perm.role,
      company_role: perm.companyRole,
      permissions: perm.permissions,
      team_id: perm.teamId ?? null,
    } satisfies TeamManagementProfile);
  const teamManagementAccess = resolveTeamManagementAccess(actorProfile, perm.groupMode ?? false);
  const visibleTeamManagementProfiles = filterVisibleTeamManagementProfiles(
    teamManagementAccess,
    normalizedHydratedProfiles as TeamManagementProfile[],
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
  const leaderCandidates = filterUsableLeaderCandidates(
    teamManagementAccess,
    normalizedHydratedProfiles as TeamManagementProfile[],
  );

  return {
    access: teamManagementAccess,
    teams: visibleTeams,
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
  const [profiles, hydrationMap] = await Promise.all([
    loadAdminModuleProfiles(adminSupabase),
    loadAdminModuleMemberHydrationMap(adminSupabase, teams),
  ]);

  const hydratedProfiles = hydrateAdminModuleMemberEmails(buildAdminModuleMemberSummaries(profiles, teams), hydrationMap);
  const activeProfiles = hydratedProfiles.filter(isActiveMembership);

  return buildAdminModulesTeamManagementPayload({
    perm: {
      userId: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      companyRole: perm.companyRole,
      groupMode: perm.groupMode,
      teamId: perm.teamId,
    },
    teams,
    allProfiles: activeProfiles,
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
  const [profiles, hydrationMap] = await measureAsync("admin-modules.profilesAndHydration", async () =>
    Promise.all([
      loadAdminModuleProfiles(context.adminSupabase),
      loadAdminModuleMemberHydrationMap(context.adminSupabase, teams),
    ]),
  );
  const hydratedProfiles = hydrateAdminModuleMemberEmails(
    buildAdminModuleMemberSummaries(profiles, teams),
    hydrationMap,
  );
  const activeProfiles = hydratedProfiles.filter(isActiveMembership);
  const teamManagement = buildAdminModulesTeamManagementPayload({
    perm: {
      userId: context.user.id,
      role: context.perm.role,
      permissions: context.perm.permissions,
      companyRole: context.perm.companyRole,
      groupMode: context.perm.groupMode,
      teamId: context.perm.teamId,
    },
    teams,
    allProfiles: activeProfiles,
  });
  const visibleActiveProfileIds = new Set(teamManagement.profiles.map((profile) => profile.id));
  const visibleActiveProfiles = activeProfiles.filter((profile) => visibleActiveProfileIds.has(profile.id));
  const archivedProfiles = filterVisibleArchivedProfiles(await hydrateArchivedByNames(
    context.adminSupabase,
    hydratedProfiles.filter((profile) => profile.membership_status === "archived"),
  ), teamManagement.access);
  const orphanExemptionResult = await loadOrphanExemptionRequests({
    supabase: context.adminSupabase,
    scope: context.scope,
  });
  const canViewOrphanDetails = isCompanyOwnerActor({
    companyRole: context.perm.companyRole,
    role: context.perm.role,
  });

  return {
    currentUserId: context.user.id,
    queryDate: context.queryDate,
    perm: {
      role: context.perm.role,
      permissions: context.perm.permissions,
      companyRole: context.perm.companyRole,
      groupMode: context.perm.groupMode,
      teamId: context.perm.teamId,
    },
    permissionManagerCapabilities: context.permissionManagerCapabilities,
    allProfiles: visibleActiveProfiles,
    archivedProfiles,
    teams: context.perm.groupMode ? teams : teamManagement.teams,
    teamManagement,
    orphanExemptionRequests: canViewOrphanDetails ? orphanExemptionResult.data : [],
    orphanExemptionCount: orphanExemptionResult.count,
  };
}
