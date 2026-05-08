import { redirect } from "next/navigation";

import type { InteractionTrendDatum } from "@/components/charts/interaction-trend";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import type { ResultTrendDatum } from "@/components/charts/result-trend";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPageData } from "@/lib/loaders/admin-page";

import { InviteCodeManager } from "./generate-invite-button";
import { SubmissionStatus } from "./submission-status";
import { TeamManager } from "./team-manager";
import { TeamGroupManager } from "./team-group-manager";
import { ActionHub } from "./components/action-hub";
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

  return (
    <div className="space-y-8">
      {/* 页面标题区 */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
          Operating Cockpit
        </p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-950">
          管理员中控台
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          查看团队日报状态、关键待办和今日整体节奏
        </p>
      </div>

      {/* 指标卡行 */}
      <MetricCardsRow cards={topSummaryCards} />

      {/* 工作区双栏 */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ActionHub
          pendingRequestCount={data.summary.pendingRequestCount}
          quickActions={data.quickActions}
          canManageMembers={hasPermission(data.perm.role, data.perm.permissions, "manage_members")}
          exemptionRequests={data.exemptionRequests}
        />
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

      {/* 趋势图 */}
      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">团队趋势总览</h2>
        <div className="mt-4 space-y-6">
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
      </section>

      {/* 团队管理 */}
      {data.teamManagement.access.canView && (
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-950">团队与分组</h2>
          <div className="mt-4">
            <TeamGroupManager
              access={data.teamManagement.access}
              teams={data.teamManagement.teams}
              groups={data.teamManagement.groups}
              profiles={data.teamManagement.profiles}
              leaderCandidates={data.teamManagement.leaderCandidates}
            />
          </div>
        </section>
      )}

      {/* 邀请码管理 */}
      {canManageInviteModule && (
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-950">邀请码管理</h2>
          <div className="mt-4 space-y-6">
            <TeamManager teams={data.teams} />
            <InviteCodeManager
              adminId={user.id}
              existingCodes={data.inviteCodes}
              profileNames={Object.fromEntries(profileMap)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
