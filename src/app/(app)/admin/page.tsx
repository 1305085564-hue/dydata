import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import type { AdminPanelKey } from "@/components/admin-secondary-nav";
import type { InteractionTrendDatum } from "@/components/charts/interaction-trend";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import type { ResultTrendDatum } from "@/components/charts/result-trend";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPageData } from "@/lib/loaders/admin-page";

import { DashboardAnimatedSection } from "../dashboard/dashboard-animated-section";
import { AdminPanelLauncher } from "./admin-panel-launcher";
import { InviteCodeManager } from "./generate-invite-button";
import { SubmissionStatus } from "./submission-status";
import { TeamManager } from "./team-manager";
import { TeamGroupManager } from "./team-group-manager";
import { ActionHub } from "./components/action-hub";
import { SystemLogTicker } from "./components/system-log-ticker";
import { MetricCardsRow } from "./components/metric-cards";

interface AdminPageProps {
  searchParams: Promise<{ date?: string; panel?: AdminPanelKey }>;
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

  const canManageAdmin = data.perm.role === "owner" || data.perm.role === "admin";
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
      tone: data.summary.pendingRequestCount > 0 ? ("warning" as const) : ("neutral" as const),
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
  const currentUserName = profileMap.get(user.id)?.trim() ?? "";
  const canManageInviteModule =
    hasPermission(data.perm.role, data.perm.permissions, "manage_invite") &&
    (currentUserName === "闃跨" || currentUserName === "阿豪");
  const [resultTrendData, interactionTrendData] = Object.values(data.trendData) as [
    ResultTrendDatum[],
    InteractionTrendDatum[],
  ];

  const overviewContent = (
    <div className="space-y-6">
      <MetricCardsRow cards={topSummaryCards} />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ActionHub
          pendingRequestCount={data.summary.pendingRequestCount}
          quickActions={data.quickActions}
          canManageMembers={hasPermission(data.perm.role, data.perm.permissions, "manage_members")}
          exemptionRequests={data.exemptionRequests}
        />
        <Card className="glass-card-static border-white/70 glass-panel">
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">提交状态快照</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                关闭弹窗后仍停留在当前后台页，适合快速检查当天提交情况。
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <>
      <AppShell width="full" className="max-w-[1440px] pb-24">
        <AppShellHero
          eyebrow="Operating Cockpit"
          title="管理员中控台"
          description="停留在后台首页，用大弹窗承载重模块，并保留当前页状态与上下文。"
          meta={
            <div className="glass-panel grid gap-2 rounded-2xl p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[320px]">
              <div className="inline-flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
                <Sparkles className="size-3.5 text-[var(--color-primary)]" />
                今日总览摘要
              </div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{data.queryDate}</p>
            </div>
          }
        >
          <AdminPanelLauncher
            initialPanel={params.panel ?? null}
            userRole={data.perm.role}
            canManageAdmin={canManageAdmin}
            initialDate={data.queryDate}
            overviewContent={overviewContent}
          />

          <MetricCardsRow cards={topSummaryCards} />
        </AppShellHero>

        <DashboardAnimatedSection index={0}>
          <section className="mb-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col space-y-6">
              <AppShellSection title="团队趋势总览" className="flex-1" bodyClassName="h-full">
                <div className="space-y-6">
                  <ResultTrend
                    data={resultTrendData}
                    personalLabel="团队总量"
                    teamAverageLabel="团队人均"
                    emptyText="提交 2 天以上数据后可查看趋势图"
                  />
                  <InteractionTrend
                    data={interactionTrendData}
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
                canManageMembers={hasPermission(data.perm.role, data.perm.permissions, "manage_members")}
                exemptionRequests={data.exemptionRequests}
              />
            </div>
          </section>
        </DashboardAnimatedSection>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {data.teamManagement.access.canView ? (
            <DashboardAnimatedSection index={1} className="lg:col-span-2">
              <AppShellSection title="团队与分组" description="管理组长、组员归属和负责人直管成员。">
                <TeamGroupManager
                  access={data.teamManagement.access}
                  teams={data.teamManagement.teams}
                  groups={data.teamManagement.groups}
                  profiles={data.teamManagement.profiles}
                  leaderCandidates={data.teamManagement.leaderCandidates}
                />
              </AppShellSection>
            </DashboardAnimatedSection>
          ) : null}

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

          {canManageInviteModule ? (
            <DashboardAnimatedSection index={2}>
              <AppShellSection title="邀请码管理" description="维护成员加入入口。">
                <Card className="glass-card-static h-full border-white/60 glass-panel">
                  <CardContent className="space-y-6 p-6">
                    <TeamManager teams={data.teams} />
                    <InviteCodeManager
                      adminId={user.id}
                      existingCodes={data.inviteCodes}
                      profileNames={Object.fromEntries(profileMap)}
                    />
                  </CardContent>
                </Card>
              </AppShellSection>
            </DashboardAnimatedSection>
          ) : null}
        </div>
      </AppShell>

      <SystemLogTicker logs={data.logsWithNames} />
    </>
  );
}
