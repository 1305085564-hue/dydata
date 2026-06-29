import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePermissionsForBusinessRole, resolveBusinessRole } from "@/lib/business-role";
import type { BusinessRole } from "@/lib/business-role";
import { isMissingExemptionRequestCategoryError } from "@/lib/豁免流程";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { build团队趋势数据 } from "@/lib/趋势图";
import {
  filterVisibleTeamManagementProfiles,
  isIgnoredTeamManagementUser,
  resolveTeamManagementAccess,
  type TeamManagementAccess,
  type TeamManagementGroup,
  type TeamManagementProfile,
} from "@/lib/team-management";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { loadProfilesWithExemptionFallback } from "@/app/(app)/admin/资料加载";
import type { ExemptionRequestRow } from "@/app/(app)/admin/豁免申请列表";
import type { ExemptionCategory, ExemptType, Permissions, UserRole, UserStatus } from "@/types";
import { shiftDateOnly } from "./shared";

type AdminSupabase = SupabaseClient;
type AdminProfileRow = TeamManagementProfile & {
  status: UserStatus;
  permissions?: Permissions | null;
  created_at?: string;
  exempt_type: ExemptType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category?: ExemptionCategory | null;
  teams?: unknown;
};
type AdminReportRow = Record<string, unknown>;
type AuditLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  target?: string;
  detail?: string;
  user_name?: string;
};

async function loadPendingExemptionRequests(supabase: AdminSupabase) {
  const primary = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, exemption_category, reason, created_at")
    .eq("request_status", "pending")
    .order("created_at", { ascending: true });

  if (!isMissingExemptionRequestCategoryError(primary.error)) {
    return primary;
  }

  const fallback = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, reason, created_at")
    .eq("request_status", "pending")
    .order("created_at", { ascending: true });

  return {
    data: fallback.data?.map((request) => ({
      ...request,
      exemption_category: "waive" as const,
    })) ?? null,
    error: fallback.error,
  };
}

export interface AdminPageData {
  queryDate: string;
  perm: { role: UserRole; businessRole: BusinessRole; permissions: Permissions };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  profiles: AdminProfileRow[];
  accountRows: Array<{
    id: string;
    name: string;
    profile_id: string;
    profile_name: string;
    content_direction: string | null;
    presentation_format: string | null;
  }>;
  submittedProfileIds: string[];
  submittedAccountIds: string[];
  fullReports: AdminReportRow[];
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
  allProfiles: AdminProfileRow[];
  teams: TeamOption[];
  teamManagement: {
    access: TeamManagementAccess;
    teams: TeamOption[];
    groups: TeamManagementGroup[];
    profiles: TeamManagementProfile[];
    leaderCandidates: TeamManagementProfile[];
  };
  logsWithNames: AuditLogRow[];
  exemptionRequests: ExemptionRequestRow[];
  trendData: ReturnType<typeof build团队趋势数据>;
  topSummaryCards: Array<{ label: string; value: number; hint: string; icon: unknown }>;
  quickActions: Array<{ label: string; description: string; href?: string }>;
  summary: {
    totalProfiles: number;
    activeProfilesCount: number;
    exemptProfilesCount: number;
    todayReportCount: number;
    pendingRequestCount: number;
    latestLogAction: string | null;
  };
}

export async function loadAdminPageData({
  supabase,
  searchDate,
}: {
  supabase: AdminSupabase;
  searchDate?: string;
}): Promise<AdminPageData | null> {
  const perm = await getUserPermissions();
  if (!perm) return null;
  const permissionManagerCapabilities = getPermissionManagerCapabilities(perm.role, perm.permissions, perm.businessRole);
  const queryDate = searchDate || new Date().toISOString().split("T")[0];

  const adminSupabase = createAdminClient();

  const { data: profiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category")
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status")
        .order("created_at", { ascending: true }),
  });

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, profile_id, content_direction, presentation_format")
    .order("created_at", { ascending: true });

  const profileNameMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
  const accountRows = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name ?? "未命名账号",
    profile_id: account.profile_id,
    profile_name: profileNameMap.get(account.profile_id) ?? "未命名成员",
    content_direction: account.content_direction,
    presentation_format: account.presentation_format,
  }));

  const { data: dateReports } = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, accounts(id, name, profile_id, content_direction, presentation_format)")
    .eq("report_date", queryDate);

  const submittedProfileIds = Array.from(new Set((dateReports ?? []).map((report) => report.user_id).filter((value): value is string => Boolean(value))));
  const submittedAccountIds = Array.from(new Set((dateReports ?? []).map((report) => report.account_id).filter((value): value is string => Boolean(value))));

  const { data: fullReports } = await supabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id, content_direction, presentation_format)"
    )
    .eq("report_date", queryDate)
    .order("uploaded_at", { ascending: false });

  const sevenDaysAgo = shiftDateOnly(new Date(), -7);
  const [{ data: recentForAvg }, { data: recentAccountAvg }] = await Promise.all([
    supabase.from("daily_reports").select("submitter, play_count").gte("report_date", sevenDaysAgo).neq("report_date", queryDate),
    supabase.from("daily_reports").select("account_id, play_count").gte("report_date", sevenDaysAgo).neq("report_date", queryDate),
  ]);

  const avgPlayBySubmitter: Record<string, number> = {};
  const dayCountBySubmitter: Record<string, number> = {};
  const avgPlayByAccount: Record<string, number> = {};
  const dayCountByAccount: Record<string, number> = {};

  const sumMap = new Map<string, { total: number; count: number }>();
  for (const row of recentForAvg ?? []) {
    const key = row.submitter ?? "";
    const current = sumMap.get(key) ?? { total: 0, count: 0 };
    current.total += row.play_count ?? 0;
    current.count += 1;
    sumMap.set(key, current);
  }
  for (const [name, { total, count }] of sumMap) {
    if (count > 0) avgPlayBySubmitter[name] = Math.round(total / count);
    dayCountBySubmitter[name] = count;
  }

  const accountSumMap = new Map<string, { total: number; count: number }>();
  for (const row of recentAccountAvg ?? []) {
    const key = row.account_id ?? "";
    if (!key) continue;
    const current = accountSumMap.get(key) ?? { total: 0, count: 0 };
    current.total += row.play_count ?? 0;
    current.count += 1;
    accountSumMap.set(key, current);
  }
  for (const [accountId, { total, count }] of accountSumMap) {
    if (count > 0) avgPlayByAccount[accountId] = Math.round(total / count);
    dayCountByAccount[accountId] = count;
  }

  const teams = await getTeamOptions();
  const { data: allProfiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category, permissions, team_id, group_id, created_at")
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, permissions, created_at")
        .order("created_at", { ascending: true }),
  });

  const [authUsersResult, groupsResult] = await Promise.all([
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    adminSupabase
      .from("groups")
      .select("id, name, team_id, leader_user_id")
      .order("name", { ascending: true }),
  ]);

  const authEmailByUserId = new Map((authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null]));
  const hydratedProfiles = ((allProfiles ?? []) as AdminProfileRow[]).map((profile) => {
    return {
      ...profile,
      role: profile.role as UserRole,
      status: profile.status ?? "active",
      exempt_type: profile.exempt_type ?? null,
      exempt_start_date: profile.exempt_start_date ?? null,
      exempt_end_date: profile.exempt_end_date ?? null,
      exempt_reason: profile.exempt_reason ?? null,
      exemption_category: profile.exemption_category ?? null,
      permissions: (profile.permissions ?? {}) as Permissions,
      team_id: profile.team_id ?? null,
      group_id: profile.group_id ?? null,
      email: authEmailByUserId.get(profile.id) ?? null,
    };
  });
  const groups = ((groupsResult.data ?? []) as TeamManagementGroup[]).map((group) => ({
    id: group.id,
    name: group.name,
    team_id: group.team_id ?? null,
    leader_user_id: group.leader_user_id ?? null,
  }));
  const normalizedHydratedProfiles = hydratedProfiles.map((profile) => {
    const businessRole = resolveBusinessRole(profile, groups);
    return {
      ...profile,
      permissions: normalizePermissionsForBusinessRole(businessRole, profile.permissions ?? {}),
    };
  });
  const actorProfile =
    normalizedHydratedProfiles.find((profile) => profile.id === perm.userId) ??
    ({
      id: perm.userId,
      name: "",
      role: perm.role,
      permissions: perm.permissions,
      team_id: null,
      group_id: null,
    } satisfies TeamManagementProfile);
  const teamManagementAccess = resolveTeamManagementAccess(actorProfile, groups);
  const visibleTeamManagementProfiles = filterVisibleTeamManagementProfiles(teamManagementAccess, normalizedHydratedProfiles, groups);
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
  const leaderCandidates = normalizedHydratedProfiles
    .filter((profile) => profile.role === "admin" && profile.permissions?.manage_members !== true)
    .filter((profile) => Boolean(profile.team_id))
    .filter((profile) => !isIgnoredTeamManagementUser(profile));

  const [{ data: auditLogs }, { data: pendingRequests }] = await Promise.all([
    supabase.from("audit_logs").select("id, created_at, user_id, action, target, detail").order("created_at", { ascending: false }).limit(50),
    loadPendingExemptionRequests(supabase),
  ]);

  const profileMap = new Map(normalizedHydratedProfiles.map((profile) => [profile.id, profile.name]));
  const logsWithNames = (auditLogs ?? []).map((log) => ({
    ...log,
    target: log.target ?? undefined,
    detail: log.detail ?? undefined,
    user_name: profileMap.get(log.user_id) ?? undefined,
  }));
  const exemptionRequests: ExemptionRequestRow[] = (pendingRequests ?? []).map((request) => ({
    id: request.id,
    applicant_user_id: request.applicant_user_id,
    applicant_name: profileMap.get(request.applicant_user_id) ?? "未知成员",
    exemption_type: request.exemption_type,
    exemption_category: request.exemption_category,
    reason: request.reason,
    created_at: request.created_at,
  }));

  const sixtyDaysAgo = shiftDateOnly(new Date(), -60);
  const [{ data: teamReports }, { data: activeProfiles }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites")
      .gte("report_date", sixtyDaysAgo),
    supabase.from("profiles").select("id, status"),
  ]);

  const activeUserIds = (activeProfiles ?? [])
    .filter((profile) => (profile.status ?? "active") === "active")
    .map((profile) => profile.id);

  const trendData = build团队趋势数据(
    (teamReports ?? []).map((report) => ({
      report_date: report.report_date,
      user_id: report.user_id,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    })),
    activeUserIds,
  );

  const totalProfiles = normalizedHydratedProfiles.length;
  const activeProfilesCount = normalizedHydratedProfiles.filter((profile) => (profile.status ?? "active") === "active").length;
  const exemptProfilesCount = normalizedHydratedProfiles.filter((profile) => profile.status === "exempt").length;
  const todayReportCount = (dateReports ?? []).length;
  const pendingRequestCount = exemptionRequests.length;
  const latestLogAction = logsWithNames[0]?.action ?? null;

  return {
    queryDate,
    perm,
    permissionManagerCapabilities,
    profiles: (profiles ?? []) as AdminProfileRow[],
    accountRows,
    submittedProfileIds,
    submittedAccountIds,
    fullReports: fullReports ?? [],
    avgPlayBySubmitter,
    dayCountBySubmitter,
    avgPlayByAccount,
    dayCountByAccount,
    allProfiles: normalizedHydratedProfiles,
    teams,
    teamManagement: {
      access: teamManagementAccess,
      teams: visibleTeams,
      groups: visibleGroups,
      profiles: visibleTeamManagementProfiles,
      leaderCandidates,
    },
    logsWithNames,
    exemptionRequests,
    trendData,
    topSummaryCards: [],
    quickActions: [
      perm.role === "owner" ? { label: "AI 配置中心", description: "管理渠道、功能绑定与文案改写", href: "/admin/ai-config" } : null,
      hasPermission(perm.businessRole, perm.permissions, "use_ai_management")
        ? { label: "后台 AI 助手", description: "使用右下角浮窗处理操作与诊断" }
        : null,
      hasPermission(perm.businessRole, perm.permissions, "export_data") ? { label: "导出数据", description: "快速发给业务复盘" } : null,
      hasPermission(perm.businessRole, perm.permissions, "edit_data") ? { label: "处理异常数据", description: "优先检查今日异常值" } : null,
    ].filter((item): item is { label: string; description: string; href?: string } => item !== null),
    summary: {
      totalProfiles,
      activeProfilesCount,
      exemptProfilesCount,
      todayReportCount,
      pendingRequestCount,
      latestLogAction,
    },
  };
}
