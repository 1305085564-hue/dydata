import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
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

// New specialized components
import { ActionHub } from "./components/action-hub";
import { SystemLogTicker } from "./components/system-log-ticker";
import { MetricCardsRow } from "./components/metric-cards";

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
      icon: "Activity",
      tone: "primary" as const,
    },
    {
      label: "在岗成员",
      value: data.summary.activeProfilesCount,
      hint: `共 ${data.summary.totalProfiles} 人，豁免 ${data.summary.exemptProfilesCount} 人`,
      icon: "Users",
      tone: "neutral" as const,
    },
    {
      label: "待处理事项",
      value: data.summary.pendingRequestCount,
      hint: data.summary.pendingRequestCount > 0 ? "优先处理豁免申请" : "当前没有新增待办",
      icon: "FileClock",
      tone: data.summary.pendingRequestCount > 0 ? "warning" as const : "neutral" as const,
    },
    {
      label: "邀请码存量",
      value: data.summary.inviteCodeCount,
      hint: data.summary.inviteCodeCount > 0 ? "可直接邀请新成员" : "建议补充邀请码",
      icon: "ShieldCheck",
      tone: "neutral" as const,
    },
  ];

  const profileMap = new Map(data.allProfiles.map((profile) => [profile.id, profile.name]));

  return (
    <>
      <AppShell width="full" className="max-w-[1440px] pb-24">
        <AppShellHero
          eyebrow="Operating Cockpit"
          title="管理员中控台"
          description="先看今天的整体状态，再处理趋势、待办和成员工具，避免在长列表里来回找重点。"
          meta={
            <div className="glass-panel grid gap-2 rounded-2xl p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
              <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
                <Sparkles className="size-3.5 text-[var(--color-primary)]" />
                今日总控摘要
              </div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{data.queryDate}</p>
            </div>
          }
        >
          <AdminSecondaryNav pathname="/admin" canManageAdmin />
          
          <MetricCardsRow cards={topSummaryCards} />
        </AppShellHero>

        <DashboardAnimatedSection index={0}>
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] mb-8">
            <div className="space-y-6 flex flex-col">
              <AppShellSection
                title="团队趋势总览"
                className="flex-1"
                bodyClassName="h-full"
              >
                <div className="space-y-6">
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
                </div>
              </AppShellSection>
            </div>

            <div className="flex flex-col">
              <ActionHub 
                pendingRequestCount={data.summary.pendingRequestCount} 
                quickActions={data.quickActions} 
              />
            </div>
          </section>
        </DashboardAnimatedSection>

        {/* Bento Box Layout for subsequent modules */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <DashboardAnimatedSection index={1} className="lg:col-span-2">
            <AppShellSection title="提交状态检查" description="先处理谁没交，再做后续管理动作。">
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
            </AppShellSection>
          </DashboardAnimatedSection>

          {hasPermission(data.perm.role, data.perm.permissions, "manage_members") && (
            <DashboardAnimatedSection index={2}>
              <AppShellSection title="豁免申请" description="集中处理成员当天的豁免请求。">
                <Card className="glass-card-static border-white/60 glass-panel h-full">
                  <CardContent className="p-0">
                    <豁免申请列表 requests={data.exemptionRequests} />
                  </CardContent>
                </Card>
              </AppShellSection>
            </DashboardAnimatedSection>
          )}

          {(data.permissionManagerCapabilities.canRemoveMember || data.permissionManagerCapabilities.canChangeRole || data.permissionManagerCapabilities.canEditPermissions) && (
            <DashboardAnimatedSection index={3}>
              <AppShellSection title="角色与权限管理" description="控制成员角色和管理权限。">
                <Card className="glass-card-static border-white/60 glass-panel h-full">
                  <CardContent className="p-0">
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
                  </CardContent>
                </Card>
              </AppShellSection>
            </DashboardAnimatedSection>
          )}

          {hasPermission(data.perm.role, data.perm.permissions, "manage_invite") && (
            <DashboardAnimatedSection index={4}>
              <AppShellSection title="邀请码管理" description="维护成员加入入口。">
                <Card className="glass-card-static border-white/60 glass-panel h-full">
                  <CardContent className="p-0">
                    <InviteCodeManager adminId={user.id} existingCodes={data.inviteCodes} profileNames={Object.fromEntries(profileMap)} />
                  </CardContent>
                </Card>
              </AppShellSection>
            </DashboardAnimatedSection>
          )}
          
          {hasPermission(data.perm.role, data.perm.permissions, "edit_data") && (
            <DashboardAnimatedSection index={5} className="lg:col-span-2">
              <AppShellSection title="数据管理与修正" description="处理异常值、补录和修正。">
                <Card className="glass-card-static border-white/60 glass-panel h-full">
                  <CardContent className="p-0">
                    <DataManager
                      reports={data.fullReports}
                      defaultDate={data.queryDate}
                      avgPlayBySubmitter={data.avgPlayBySubmitter}
                      dayCountBySubmitter={data.dayCountBySubmitter}
                      avgPlayByAccount={data.avgPlayByAccount}
                      dayCountByAccount={data.dayCountByAccount}
                    />
                  </CardContent>
                </Card>
              </AppShellSection>
            </DashboardAnimatedSection>
          )}

          <div className="lg:col-span-2 grid gap-6 md:grid-cols-2">
            {hasPermission(data.perm.role, data.perm.permissions, "export_data") && (
              <DashboardAnimatedSection index={6}>
                <AppShellSection title="数据导出">
                  <Card className="glass-card-static border-white/60 glass-panel h-full">
                    <CardContent className="p-0">
                      <ExportButton />
                    </CardContent>
                  </Card>
                </AppShellSection>
              </DashboardAnimatedSection>
            )}

            {hasPermission(data.perm.role, data.perm.permissions, "view_audit_log") && (
              <DashboardAnimatedSection index={7}>
                <AppShellSection title="近期操作审计">
                  <Card className="glass-card-static border-white/60 glass-panel h-full">
                    <CardContent className="p-0">
                      <AuditLogList logs={data.logsWithNames} />
                    </CardContent>
                  </Card>
                </AppShellSection>
              </DashboardAnimatedSection>
            )}
          </div>
        </div>
      </AppShell>

      {/* 底部全屏动态流组件 */}
      <SystemLogTicker logs={data.logsWithNames} />
    </>
  );
}
