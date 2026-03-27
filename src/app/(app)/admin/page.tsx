import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DashboardAnimatedSection } from "../dashboard/dashboard-animated-section";
import { InviteCodeManager } from "./generate-invite-button";
import { SubmissionStatus } from "./submission-status";
import { ExportButton } from "./export-button";
import { DataManager } from "./data-manager";
import { AuditLogList } from "./audit-log-list";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { build团队趋势数据 } from "@/lib/趋势图";
import { PermissionManager } from "./permission-manager";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { getPermissionManagerCapabilities } from "./权限管理";
import { loadProfilesWithExemptionFallback } from "./资料加载";
import { 豁免申请列表 } from "./豁免申请列表";
import type { ExemptionRequestRow } from "./豁免申请列表";
import type { UserRole, Permissions } from "@/types";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  const permissionManagerCapabilities = getPermissionManagerCapabilities(perm.role, perm.permissions);

  const params = await searchParams;
  const queryDate = params.date || new Date().toISOString().split("T")[0];

  // All profiles with status
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
    name: account.name,
    profile_id: account.profile_id,
    profile_name: profileNameMap.get(account.profile_id) ?? "未命名成员",
    content_direction: account.content_direction,
    presentation_format: account.presentation_format,
  }));

  // Submissions for selected date
  const { data: dateReports } = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, accounts(id, name, profile_id, content_direction, presentation_format)")
    .eq("report_date", queryDate);

  const submittedProfileIds = Array.from(
    new Set((dateReports ?? []).map((report) => report.user_id).filter((value): value is string => Boolean(value)))
  );
  const submittedAccountIds = Array.from(
    new Set((dateReports ?? []).map((report) => report.account_id).filter((value): value is string => Boolean(value)))
  );

  // Full reports for selected date (for data manager)
  const { data: fullReports } = await supabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id, content_direction, presentation_format)"
    )
    .eq("report_date", queryDate)
    .order("uploaded_at", { ascending: false });

  // Anomaly detection: avg play count per submitter (last 7 days)
  const sevenDaysAgoDate = new Date();
  sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
  const sevenDaysAgo = sevenDaysAgoDate.toISOString().split("T")[0];
  const { data: recentForAvg } = await supabase
    .from("daily_reports")
    .select("submitter, play_count")
    .gte("report_date", sevenDaysAgo)
    .neq("report_date", queryDate); // exclude current day

  const avgPlayBySubmitter: Record<string, number> = {};
  const dayCountBySubmitter: Record<string, number> = {};
  const avgPlayByAccount: Record<string, number> = {};
  const dayCountByAccount: Record<string, number> = {};
  const sumMap = new Map<string, { total: number; count: number }>();
  const accountSumMap = new Map<string, { total: number; count: number }>();
  for (const r of recentForAvg ?? []) {
    const key = r.submitter ?? "";
    const cur = sumMap.get(key) ?? { total: 0, count: 0 };
    cur.total += r.play_count ?? 0;
    cur.count += 1;
    sumMap.set(key, cur);
  }
  for (const [name, { total, count }] of sumMap) {
    if (count > 0) avgPlayBySubmitter[name] = Math.round(total / count);
    dayCountBySubmitter[name] = count;
  }

  const { data: recentAccountAvg } = await supabase
    .from("daily_reports")
    .select("account_id, play_count")
    .gte("report_date", sevenDaysAgo)
    .neq("report_date", queryDate);

  for (const r of recentAccountAvg ?? []) {
    const key = r.account_id ?? "";
    if (!key) continue;
    const cur = accountSumMap.get(key) ?? { total: 0, count: 0 };
    cur.total += r.play_count ?? 0;
    cur.count += 1;
    accountSumMap.set(key, cur);
  }
  for (const [accountId, { total, count }] of accountSumMap) {
    if (count > 0) avgPlayByAccount[accountId] = Math.round(total / count);
    dayCountByAccount[accountId] = count;
  }

  // All profiles for member list — use service_role client to bypass RLS
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

  // Audit logs (recent 50)
  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, created_at, user_id, action, target, detail")
    .order("created_at", { ascending: false })
    .limit(50);

  // Map user_id to name for audit logs
  const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p.name]));
  const logsWithNames = (auditLogs ?? []).map((log) => ({
    ...log,
    user_name: profileMap.get(log.user_id) ?? undefined,
  }));

  // Pending exemption requests
  const { data: pendingRequests } = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, reason, created_at")
    .eq("request_status", "pending")
    .order("created_at", { ascending: true });

  const exemptionRequests: ExemptionRequestRow[] = (pendingRequests ?? []).map((r) => ({
    id: r.id,
    applicant_user_id: r.applicant_user_id,
    applicant_name: profileMap.get(r.applicant_user_id) ?? "未知成员",
    exemption_type: r.exemption_type,
    reason: r.reason,
    created_at: r.created_at,
  }));

  // Invite codes
  const { data: inviteCodes } = await supabase
    .from("invite_codes")
    .select("id, code, used, used_by, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Team dashboard: aggregate last 60 days (for period-over-period comparison)
  const sixtyDaysAgoDate = new Date();
  sixtyDaysAgoDate.setDate(sixtyDaysAgoDate.getDate() - 60);
  const sixtyDaysAgo = sixtyDaysAgoDate.toISOString().split("T")[0];
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
    activeUserIds
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-[var(--radius-2xl)] border border-white/60 bg-[var(--glass-bg)] px-5 py-5 shadow-[var(--shadow-card)] backdrop-blur-[20px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Admin Console</p>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">管理员后台</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">集中管理成员、数据、权限与导出操作。</p>
          </div>
        </div>
      </section>

      {[
        {
          key: "submission-status",
          content: (
            <SubmissionStatus
              profiles={(profiles ?? []).map((p) => ({
                ...p,
                status: p.status ?? "active",
              }))}
              accounts={accountRows}
              submittedProfileIds={submittedProfileIds}
              submittedAccountIds={submittedAccountIds}
              defaultDate={queryDate}
            />
          ),
        },
        {
          key: "team-dashboard",
          content: (
            <Card className="glass-card border-white/60 bg-white/70">
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">团队仪表盘</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ResultTrend
                  data={trendData.结果趋势}
                  personalLabel="团队总量"
                  teamAverageLabel="团队人均"
                  emptyText="提交 2 天以上数据后可查看趋势图"
                />
                <InteractionTrend
                  data={trendData.互动趋势}
                  personalLabel="团队质量分"
                  teamAverageLabel="团队人均"
                  emptyText="提交 2 天以上数据后可查看互动质量分趋势"
                />
              </CardContent>
            </Card>
          ),
        },
        ...(hasPermission(perm.role, perm.permissions, "manage_members")
          ? [
              {
                key: "exemption-requests",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">
                        豁免申请
                        {exemptionRequests.length > 0 && (
                          <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground">
                            {exemptionRequests.length}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <豁免申请列表 requests={exemptionRequests} />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
        {
          key: "member-list",
          content: (
            <Card className="glass-card-static border-white/60 bg-white/70">
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">成员列表</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead className="hidden md:table-cell">所属团队</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="hidden md:table-cell">注册时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(allProfiles ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                              <Users className="size-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">还没有成员</p>
                            <p className="text-xs text-[var(--color-text-secondary)]">先生成邀请码邀请成员加入</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (allProfiles ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>
                          <Badge variant={p.role === "owner" ? "destructive" : p.role === "admin" ? "default" : "secondary"}>
                            {p.role === "owner" ? "创始人" : p.role === "admin" ? "管理员" : "成员"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{typeof p.teams === "object" && p.teams && "name" in p.teams ? (p.teams.name as string) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "exempt" ? "outline" : "default"} className="text-xs">
                            {p.status === "exempt" ? "豁免" : "在岗"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString("zh-CN") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ),
        },
        ...(permissionManagerCapabilities.canRemoveMember || permissionManagerCapabilities.canChangeRole || permissionManagerCapabilities.canEditPermissions
          ? [
              {
                key: "permission-manager",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">权限管理</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PermissionManager
                        members={(allProfiles ?? []).map((p) => ({
                          id: p.id,
                          name: p.name,
                          role: p.role as UserRole,
                          permissions: (p.permissions ?? {}) as Permissions,
                        }))}
                        currentUserId={user.id}
                        currentUserRole={perm.role}
                        currentUserPermissions={perm.permissions}
                      />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
        ...(hasPermission(perm.role, perm.permissions, "edit_data")
          ? [
              {
                key: "data-manager",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">数据管理</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DataManager reports={fullReports ?? []} defaultDate={queryDate} avgPlayBySubmitter={avgPlayBySubmitter} dayCountBySubmitter={dayCountBySubmitter} avgPlayByAccount={avgPlayByAccount} dayCountByAccount={dayCountByAccount} />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
        ...(hasPermission(perm.role, perm.permissions, "export_data")
          ? [
              {
                key: "data-export",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">数据导出</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ExportButton />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
        ...(hasPermission(perm.role, perm.permissions, "manage_invite")
          ? [
              {
                key: "invite-code",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">邀请码管理</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <InviteCodeManager adminId={user.id} existingCodes={inviteCodes ?? []} profileNames={Object.fromEntries(profileMap)} />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
        ...(hasPermission(perm.role, perm.permissions, "view_audit_log")
          ? [
              {
                key: "audit-logs",
                content: (
                  <Card className="glass-card-static border-white/60 bg-white/70">
                    <CardHeader>
                      <CardTitle className="font-semibold tracking-tight">操作日志（最近 50 条）</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AuditLogList logs={logsWithNames} />
                    </CardContent>
                  </Card>
                ),
              },
            ]
          : []),
      ].map((section, index) => (
        <DashboardAnimatedSection key={section.key} index={index}>
          {section.content}
        </DashboardAnimatedSection>
      ))}
    </div>
  );

}
