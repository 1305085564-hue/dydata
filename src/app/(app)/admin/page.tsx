import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { loadProfilesWithExemptionFallback } from "./资料加载";
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
  const isOwner = perm.role === "owner";

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

  // All profiles for member list
  const { data: allProfiles } = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () =>
      supabase
        .from("profiles")
        .select("id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, permissions, created_at")
        .order("created_at", { ascending: true }),
    loadWithoutExemption: async () =>
      supabase
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
        <div className="mx-auto max-w-5xl space-y-8">
          <h1 className="text-2xl font-semibold">管理员后台</h1>

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

          {/* Team dashboard */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>团队仪表盘</CardTitle>
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

          {/* Member list */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>成员列表</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>注册时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(allProfiles ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={p.role === "owner" ? "destructive" : p.role === "admin" ? "default" : "secondary"}>
                          {p.role === "owner" ? "创始人" : p.role === "admin" ? "管理员" : "成员"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status === "exempt" ? "outline" : "default"} className="text-xs">
                          {p.status === "exempt" ? "豁免" : "在岗"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("zh-CN") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Permission manager - owner only */}
          {isOwner && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>权限管理</CardTitle>
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
                />
              </CardContent>
            </Card>
          )}

          {/* Data manager */}
          {hasPermission(perm.role, perm.permissions, "edit_data") && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>数据管理</CardTitle>
              </CardHeader>
              <CardContent>
                <DataManager reports={fullReports ?? []} defaultDate={queryDate} avgPlayBySubmitter={avgPlayBySubmitter} dayCountBySubmitter={dayCountBySubmitter} avgPlayByAccount={avgPlayByAccount} dayCountByAccount={dayCountByAccount} />
              </CardContent>
            </Card>
          )}

          {/* Data export */}
          {hasPermission(perm.role, perm.permissions, "export_data") && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>数据导出</CardTitle>
              </CardHeader>
              <CardContent>
                <ExportButton />
              </CardContent>
            </Card>
          )}

          {/* Invite code */}
          {hasPermission(perm.role, perm.permissions, "manage_invite") && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>邀请码管理</CardTitle>
              </CardHeader>
              <CardContent>
                <InviteCodeManager adminId={user.id} existingCodes={inviteCodes ?? []} profileNames={Object.fromEntries(profileMap)} />
              </CardContent>
            </Card>
          )}

          {/* Audit logs */}
          {hasPermission(perm.role, perm.permissions, "view_audit_log") && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>操作日志（最近 50 条）</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditLogList logs={logsWithNames} />
              </CardContent>
            </Card>
          )}
        </div>
  );
}
