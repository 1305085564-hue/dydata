import { redirect } from "next/navigation";
import { Activity, ArrowRight, FileClock, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { DashboardAnimatedSection } from "../dashboard/dashboard-animated-section";
import { InviteCodeManager } from "./generate-invite-button";
import { SubmissionStatus } from "./submission-status";
import { ExportButton } from "./export-button";
import { DataManager } from "./data-manager";
import { AuditLogList } from "./audit-log-list";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { PermissionManager } from "./permission-manager";
import { hasPermission } from "@/lib/permissions";
import { 豁免申请列表 } from "./豁免申请列表";
import { loadAdminPageData } from "@/lib/loaders/admin-page";
import type { Permissions, UserRole } from "@/types";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const data = await loadAdminPageData({
    supabase,
    searchDate: params.date,
  });

  if (!data) redirect("/login");

  const topSummaryCards = [
    {
      label: "今日提交",
      value: data.summary.todayReportCount,
      hint: `${data.submittedProfileIds.length} 人已提交`,
      icon: Activity,
    },
    {
      label: "在岗成员",
      value: data.summary.activeProfilesCount,
      hint: `共 ${data.summary.totalProfiles} 人，豁免 ${data.summary.exemptProfilesCount} 人`,
      icon: Users,
    },
    {
      label: "待处理事项",
      value: data.summary.pendingRequestCount,
      hint: data.summary.pendingRequestCount > 0 ? "优先处理豁免申请" : "当前没有新增待办",
      icon: FileClock,
    },
    {
      label: "邀请码存量",
      value: data.summary.inviteCodeCount,
      hint: data.summary.inviteCodeCount > 0 ? "可直接邀请新成员" : "建议补充邀请码",
      icon: ShieldCheck,
    },
  ];
  const profileMap = new Map(data.allProfiles.map((profile) => [profile.id, profile.name]));

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Operating Cockpit"
        title="管理员中控台"
        description="先看今天的整体状态，再处理趋势、待办和成员工具，避免在长列表里来回找重点。"
        meta={
          <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/88 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
            <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
              <Sparkles className="size-3.5 text-[var(--color-primary)]" />
              今日总控摘要
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{data.queryDate}</p>
            <p>{data.summary.latestLogAction ? `最新日志：${data.summary.latestLogAction}` : "暂无最新日志，系统运行正常。"}</p>
          </div>
        }
      >
        <AdminSecondaryNav pathname="/admin" canManageAdmin />

        <AppShellMetricStrip
          items={topSummaryCards.map((card) => ({
            label: card.label,
            value: card.value,
            hint: card.hint,
            tone:
              card.label === "待处理事项" && card.value > 0
                ? "warning"
                : card.label === "今日提交"
                  ? "primary"
                  : "neutral",
          }))}
          columns={4}
        />
      </AppShellHero>

      <DashboardAnimatedSection index={0}>
        <AppShellSection
          eyebrow="Team Overview"
          title="先看团队趋势和今日优先事项"
          description="把总览、待办和快捷动作放在同一屏，管理动作更集中。"
        >
          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="glass-card border-white/60 bg-white/72">
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">团队趋势总览</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ResultTrend
                  data={data.trendData.结果趋势}
                  personalLabel="团队总量"
                  teamAverageLabel="团队人均"
                  emptyText="提交 2 天以上数据后可查看趋势图"
                />
                <InteractionTrend
                  data={data.trendData.互动趋势}
                  personalLabel="团队质量分"
                  teamAverageLabel="团队人均"
                  emptyText="提交 2 天以上数据后可查看互动质量分趋势"
                />
              </CardContent>
            </Card>

            <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">今日优先事项</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-white/75 bg-white/80 p-4 shadow-[var(--shadow-light)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">提交状态检查</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">先确认今天谁还没交，再处理异常和豁免。</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-primary">
                      {data.summary.todayReportCount} 条
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/75 bg-white/80 p-4 shadow-[var(--shadow-light)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">待处理申请</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">豁免申请和权限相关事项优先处理。</p>
                    </div>
                    <Badge variant={data.summary.pendingRequestCount > 0 ? "destructive" : "outline"} className="rounded-full">
                      {data.summary.pendingRequestCount}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/75 bg-white/80 p-4 shadow-[var(--shadow-light)]">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">快捷动作</p>
                  <div className="mt-3 space-y-2">
                    {data.quickActions.length > 0 ? (
                      data.quickActions.map((item) =>
                        item.href ? (
                          <Link
                            key={item.label}
                            href={item.href}
                            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white/78 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]"
                          >
                            <div>
                              <p className="font-medium text-[var(--color-text-primary)]">{item.label}</p>
                              <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                            </div>
                            <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
                          </Link>
                        ) : (
                          <div key={item.label} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white/78 px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
                            <div>
                              <p className="font-medium text-[var(--color-text-primary)]">{item.label}</p>
                              <p className="text-xs text-[var(--color-text-secondary)]">{item.description}</p>
                            </div>
                            <ArrowRight className="size-4 text-[var(--color-text-tertiary)]" />
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-sm text-[var(--color-text-secondary)]">当前权限下暂无快捷操作。</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </AppShellSection>
      </DashboardAnimatedSection>

      {[
        {
          key: "submission-status",
          title: "提交状态",
          description: "先处理谁没交，再做后续管理动作。",
          content: (
            <SubmissionStatus
              profiles={data.profiles.map((profile) => ({
                ...profile,
                status: profile.status ?? "active",
              }))}
              accounts={data.accountRows}
              submittedProfileIds={data.submittedProfileIds}
              submittedAccountIds={data.submittedAccountIds}
              defaultDate={data.queryDate}
            />
          ),
        },
        ...(hasPermission(data.perm.role, data.perm.permissions, "manage_members")
          ? [
              {
                key: "exemption-requests",
                title: "豁免申请",
                description: "集中处理成员当天的豁免请求。",
                content: <豁免申请列表 requests={data.exemptionRequests} />,
              },
            ]
          : []),
        {
          key: "member-list",
          title: "成员列表",
          description: "统一看成员角色、状态和注册时间。",
          content: (
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
                {data.allProfiles.length === 0 ? (
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
                ) : data.allProfiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>{profile.name}</TableCell>
                    <TableCell>
                      <Badge variant={profile.role === "owner" ? "destructive" : profile.role === "admin" ? "default" : "secondary"}>
                        {profile.role === "owner" ? "创始人" : profile.role === "admin" ? "管理员" : "成员"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{typeof profile.teams === "object" && profile.teams && "name" in profile.teams ? (profile.teams.name as string) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={profile.status === "exempt" ? "outline" : "default"} className="text-xs">
                        {profile.status === "exempt" ? "豁免" : "在岗"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                      {profile.created_at ? new Date(profile.created_at).toLocaleDateString("zh-CN") : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ),
        },
        ...(data.permissionManagerCapabilities.canRemoveMember || data.permissionManagerCapabilities.canChangeRole || data.permissionManagerCapabilities.canEditPermissions
          ? [
              {
                key: "permission-manager",
                title: "权限管理",
                description: "控制成员角色和管理权限。",
                content: (
                  <PermissionManager
                    members={data.allProfiles.map((profile) => ({
                      id: profile.id,
                      name: profile.name,
                      role: profile.role as UserRole,
                      permissions: (profile.permissions ?? {}) as Permissions,
                    }))}
                    currentUserId={user.id}
                    currentUserRole={data.perm.role}
                    currentUserPermissions={data.perm.permissions}
                  />
                ),
              },
            ]
          : []),
        ...(hasPermission(data.perm.role, data.perm.permissions, "edit_data")
          ? [
              {
                key: "data-manager",
                title: "数据管理",
                description: "处理异常值、补录和修正。",
                content: (
                  <DataManager
                    reports={data.fullReports}
                    defaultDate={data.queryDate}
                    avgPlayBySubmitter={data.avgPlayBySubmitter}
                    dayCountBySubmitter={data.dayCountBySubmitter}
                    avgPlayByAccount={data.avgPlayByAccount}
                    dayCountByAccount={data.dayCountByAccount}
                  />
                ),
              },
            ]
          : []),
        ...(hasPermission(data.perm.role, data.perm.permissions, "export_data")
          ? [
              {
                key: "data-export",
                title: "数据导出",
                description: "快速导出当前数据给业务复盘。",
                content: <ExportButton />,
              },
            ]
          : []),
        ...(hasPermission(data.perm.role, data.perm.permissions, "manage_invite")
          ? [
              {
                key: "invite-code",
                title: "邀请码管理",
                description: "维护成员加入入口。",
                content: <InviteCodeManager adminId={user.id} existingCodes={data.inviteCodes} profileNames={Object.fromEntries(profileMap)} />,
              },
            ]
          : []),
        ...(hasPermission(data.perm.role, data.perm.permissions, "view_audit_log")
          ? [
              {
                key: "audit-logs",
                title: "操作日志（最近 50 条）",
                description: "用于排查误操作和追踪后台变更。",
                content: <AuditLogList logs={data.logsWithNames} />,
              },
            ]
          : []),
      ].map((section, index) => (
        <DashboardAnimatedSection key={section.key} index={index + 1}>
          <AppShellSection eyebrow="Management Module" title={section.title} description={section.description}>
            <Card className="glass-card-static border-white/60 bg-white/70">
              <CardContent className="p-0">
                {section.content}
              </CardContent>
            </Card>
          </AppShellSection>
        </DashboardAnimatedSection>
      ))}
    </AppShell>
  );
}
