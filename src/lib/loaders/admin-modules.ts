import type { AuditLogList } from "@/app/(app)/admin/audit-log-list";
import type { DataManager } from "@/app/(app)/admin/data-manager";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { loadProfilesWithExemptionFallback } from "@/app/(app)/admin/资料加载";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTeamMeta, getTeamOptions } from "@/lib/teams";
import type { Permissions, UserRole } from "@/types";

import { shiftDateOnly } from "./shared";

type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

export interface AdminModulesData {
  currentUserId: string;
  queryDate: string;
  perm: { role: UserRole; permissions: Permissions };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  allProfiles: Array<{
    id: string;
    name: string;
    role: string;
    status: string | null;
    permissions: Permissions | null;
    email: string | null;
    team_name: string | null;
  }>;
  fullReports: Parameters<typeof DataManager>[0]["reports"];
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
  logsWithNames: Parameters<typeof AuditLogList>[0]["logs"];
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

  const permissionManagerCapabilities = getPermissionManagerCapabilities(perm.role, perm.permissions);
  const queryDate = searchDate || new Date().toISOString().split("T")[0];

  const { data: fullReports } = await supabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id, content_direction, presentation_format)"
    )
    .eq("report_date", queryDate)
    .order("uploaded_at", { ascending: false });

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

  const avgPlayBySubmitter: Record<string, number> = {};
  const dayCountBySubmitter: Record<string, number> = {};
  const avgPlayByAccount: Record<string, number> = {};
  const dayCountByAccount: Record<string, number> = {};

  const submitterSums = new Map<string, { total: number; count: number }>();
  for (const row of recentForAvg ?? []) {
    const key = row.submitter ?? "";
    const current = submitterSums.get(key) ?? { total: 0, count: 0 };
    current.total += row.play_count ?? 0;
    current.count += 1;
    submitterSums.set(key, current);
  }

  for (const [name, { total, count }] of submitterSums) {
    if (count > 0) avgPlayBySubmitter[name] = Math.round(total / count);
    dayCountBySubmitter[name] = count;
  }

  const accountSums = new Map<string, { total: number; count: number }>();
  for (const row of recentAccountAvg ?? []) {
    const key = row.account_id ?? "";
    if (!key) continue;

    const current = accountSums.get(key) ?? { total: 0, count: 0 };
    current.total += row.play_count ?? 0;
    current.count += 1;
    accountSums.set(key, current);
  }

  for (const [accountId, { total, count }] of accountSums) {
    if (count > 0) avgPlayByAccount[accountId] = Math.round(total / count);
    dayCountByAccount[accountId] = count;
  }

  const adminSupabase = createAdminClient();
  const { data: allProfiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      adminSupabase
        .from("profiles")
        .select(
          "id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category, permissions, team_id, created_at"
        )
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, permissions, team_id, created_at")
        .order("created_at", { ascending: true }) as never,
  });

  const [authUsersResult, teams] = await Promise.all([
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    getTeamOptions(),
  ]);
  const authUserById = new Map(
    (authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser]),
  );
  const authEmailByUserId = new Map(
    (authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null]),
  );
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  const hydratedAllProfiles = (allProfiles ?? []).map((profile) => {
    const metadata = authUserById.get(profile.id)?.user_metadata ?? {};
    const metadataTeamName = getTeamMeta(metadata).teamName;
    const dbTeamName = profile.team_id ? (teamNameById.get(profile.team_id) ?? null) : null;

    return {
      ...profile,
      email: authEmailByUserId.get(profile.id) ?? null,
      team_name: dbTeamName ?? metadataTeamName,
      permissions: (profile.permissions ?? null) as Permissions | null,
    };
  }) as AdminModulesData["allProfiles"];

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, created_at, user_id, action, target, detail")
    .order("created_at", { ascending: false })
    .limit(50);

  const profileMap = new Map(hydratedAllProfiles.map((profile) => [profile.id, profile.name]));
  const logsWithNames = (auditLogs ?? []).map((log) => ({
    ...log,
    user_name: profileMap.get(log.user_id) ?? undefined,
  }));

  return {
    currentUserId: user.id,
    queryDate,
    perm,
    permissionManagerCapabilities,
    allProfiles: hydratedAllProfiles,
    fullReports: fullReports ?? [],
    avgPlayBySubmitter,
    dayCountBySubmitter,
    avgPlayByAccount,
    dayCountByAccount,
    logsWithNames,
  };
}
