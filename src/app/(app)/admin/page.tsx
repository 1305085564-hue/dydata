import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPageData } from "@/lib/loaders/admin-page";

import { DashboardAnimatedSection } from "../dashboard/dashboard-animated-section";
import { InviteCodeManager } from "./generate-invite-button";
import { SubmissionStatus } from "./submission-status";
import { TeamManager } from "./team-manager";
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
  const currentUserName = profileMap.get(user.id)?.trim() ?? "";
  const canManageInviteModule =
    hasPermission(data.perm.role, data.perm.permissions, "manage_invite") &&
    currentUserName === "阿禅";

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
          <section className="mb-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col space-y-6">
              <AppShellSection title="团队趋势总览" className="flex-1" bodyClassName="h-full">
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
                canManageMembers={hasPermission(data.perm.role, data.perm.permissions, "manage_members")}
                exemptionRequests={data.exemptionRequests}
              />
            </div>
          </section>
        </DashboardAnimatedSection>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
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
