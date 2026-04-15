import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { build团队趋势数据 } from "@/lib/趋势图";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { getPermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import { loadProfilesWithExemptionFallback } from "@/app/(app)/admin/资料加载";
import type { ExemptionRequestRow } from "@/app/(app)/admin/豁免申请列表";
import type { Permissions, UserRole } from "@/types";
import { shiftDateOnly } from "./shared";

type AdminSupabase = SupabaseClient<any, "public", any>;

export interface AdminPageData {
  queryDate: string;
  perm: { role: UserRole; permissions: Permissions };
  permissionManagerCapabilities: ReturnType<typeof getPermissionManagerCapabilities>;
  profiles: any[];
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
  fullReports: any[];
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
  allProfiles: any[];
  logsWithNames: any[];
  exemptionRequests: ExemptionRequestRow[];
  inviteCodes: any[];
  trendData: ReturnType<typeof build团队趋势数据>;
  topSummaryCards: Array<{ label: string; value: number; hint: string; icon: any }>;
  quickActions: Array<{ label: string; description: string; href?: string }>;
  summary: {
    totalProfiles: number;
    activeProfilesCount: number;
    exemptProfilesCount: number;
    todayReportCount: number;
    pendingRequestCount: number;
    inviteCodeCount: number;
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
  const permissionManagerCapabilities = getPermissionManagerCapabilities(perm.role, perm.permissions);
  const queryDate = searchDate || new Date().toISOString().split("T")[0];

  const { data: profiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      supabase
        .from("profiles")
        .select("id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason")
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      supabase
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

  const adminSupabase = createAdminClient();
  const { data: allProfiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, permissions, created_at")
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      adminSupabase
        .from("profiles")
        .select("id, name, role, status, permissions, created_at")
        .order("created_at", { ascending: true }),
  });

  const [{ data: auditLogs }, { data: pendingRequests }, { data: inviteCodes }] = await Promise.all([
    supabase.from("audit_logs").select("id, created_at, user_id, action, target, detail").order("created_at", { ascending: false }).limit(50),
    supabase
      .from("exemption_request")
      .select("id, applicant_user_id, exemption_type, reason, created_at")
      .eq("request_status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("invite_codes").select("id, code, used, used_by, expires_at, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  const profileMap = new Map((allProfiles ?? []).map((profile) => [profile.id, profile.name]));
  const logsWithNames = (auditLogs ?? []).map((log) => ({
    ...log,
    user_name: profileMap.get(log.user_id) ?? undefined,
  }));
  const exemptionRequests: ExemptionRequestRow[] = (pendingRequests ?? []).map((request) => ({
    id: request.id,
    applicant_user_id: request.applicant_user_id,
    applicant_name: profileMap.get(request.applicant_user_id) ?? "未知成员",
    exemption_type: request.exemption_type,
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

  const totalProfiles = (allProfiles ?? []).length;
  const activeProfilesCount = (allProfiles ?? []).filter((profile) => (profile.status ?? "active") === "active").length;
  const exemptProfilesCount = (allProfiles ?? []).filter((profile) => profile.status === "exempt").length;
  const todayReportCount = (dateReports ?? []).length;
  const pendingRequestCount = exemptionRequests.length;
  const inviteCodeCount = (inviteCodes ?? []).length;
  const latestLogAction = logsWithNames[0]?.action ?? null;

  return {
    queryDate,
    perm,
    permissionManagerCapabilities,
    profiles: profiles ?? [],
    accountRows,
    submittedProfileIds,
    submittedAccountIds,
    fullReports: fullReports ?? [],
    avgPlayBySubmitter,
    dayCountBySubmitter,
    avgPlayByAccount,
    dayCountByAccount,
    allProfiles: allProfiles ?? [],
    logsWithNames,
    exemptionRequests,
    inviteCodes: inviteCodes ?? [],
    trendData,
    topSummaryCards: [],
    quickActions: [
      perm.role === "owner" ? { label: "AI 渠道", description: "管理多渠道与熔断状态", href: "/admin/ai-channels" } : null,
      perm.role === "admin" || perm.role === "owner"
        ? { label: "后台 AI 助手", description: "进入高权限 AI 操作与诊断入口", href: "/admin/ai-assistant" }
        : null,
      hasPermission(perm.role, perm.permissions, "manage_invite") ? { label: "生成邀请码", description: "补充新成员入口" } : null,
      hasPermission(perm.role, perm.permissions, "export_data") ? { label: "导出数据", description: "快速发给业务复盘" } : null,
      hasPermission(perm.role, perm.permissions, "edit_data") ? { label: "处理异常数据", description: "优先检查今日异常值" } : null,
    ].filter((item): item is { label: string; description: string; href?: string } => item !== null),
    summary: {
      totalProfiles,
      activeProfilesCount,
      exemptProfilesCount,
      todayReportCount,
      pendingRequestCount,
      inviteCodeCount,
      latestLogAction,
    },
  };
}
