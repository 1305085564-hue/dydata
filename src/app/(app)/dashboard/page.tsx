import { redirect } from "next/navigation";
import { Clock, GalleryVerticalEnd, ListChecks, Sparkles, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { VideoSubmitPanel } from "./video-submit-panel";
import { HistoryList } from "./history-list";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await loadDashboardPageData({
    supabase,
    userId: user.id,
  });

  return (
    <AppShell width="wide" className="dashboard-shell pb-24 md:pb-6">
      <DashboardAnimatedSection index={0}>
        <AppShellHero
          eyebrow="Daily Submission"
          title="先完成今日提报，再看趋势和排行"
          description="第一屏只保留最重要的状态和操作入口，减少漏填、重复提交和来回查找。"
          meta={
            <div className="dashboard-summary-chip text-xs sm:text-sm">
              日期
              <span className="font-semibold text-foreground">{data.today}</span>
            </div>
          }
        >
          <AppShellMetricStrip
            columns={4}
            items={[
              {
                label: "账号总数",
                value: data.summary.totalAccounts,
                hint: "今日需要关注的账号",
                tone: "primary",
              },
              {
                label: "已提交",
                value: data.summary.submittedCount,
                hint: "已完成今日数据提报",
                tone: "success",
              },
              {
                label: "待提交",
                value: data.summary.pendingCount,
                hint: "优先补齐，避免遗漏",
                tone: data.summary.pendingCount > 0 ? "warning" : "neutral",
              },
              {
                label: "最近记录",
                value: data.summary.historyCount,
                hint: "保留近 30 条历史",
                tone: "neutral",
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <VideoSubmitPanel
              accounts={data.accounts}
              userId={data.userId}
              userDisplayName={data.userDisplayName}
              today={data.today}
              todayReports={data.todayReports}
              hasPendingExemption={data.hasPendingExemption}
            />

            <div className="glass-card-static space-y-3 p-4 sm:p-5">
              <div className="space-y-1">
                <p className="dashboard-section-kicker inline-flex items-center gap-2">
                  <Sparkles className="size-3.5" />
                  今日操作
                </p>
                <p className="text-sm text-muted-foreground">按这个顺序做，最快，也最不容易出错。</p>
              </div>

              <div className="grid gap-2">
                {[
                  {
                    title: "先选账号",
                    description: "先确认今天要提交的是哪个账号。",
                    icon: ListChecks,
                  },
                  {
                    title: "再导入截图",
                    description: "优先用截图回填，减少手动录入。",
                    icon: GalleryVerticalEnd,
                  },
                  {
                    title: "最后提交复查",
                    description: "提交后确认状态卡已更新为已提交。",
                    icon: Clock,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="dashboard-field-group flex items-start gap-3 rounded-2xl p-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AppShellHero>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={1}>
        <AppShellSection
          eyebrow="Trend Snapshot"
          title="先看趋势，再判断今天要不要调整"
          description="结果趋势和互动质量分放在一起，避免只看播放量做判断。"
          meta={
            <div className="dashboard-summary-chip">
              <TrendingUp className="size-3.5" />
              团队对比口径：P80
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <ResultTrend
              data={data.trendData.结果趋势}
              personalLabel="我的数据"
              teamAverageLabel="团队 P80"
              emptyText="提交 2 天以上数据后可查看趋势图"
            />
            <InteractionTrend
              data={data.trendData.互动趋势}
              personalLabel="我的质量分"
              teamAverageLabel="团队 P80"
              emptyText="提交 2 天以上数据后可查看互动质量分趋势"
            />
          </div>
        </AppShellSection>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={2}>
        <AppShellSection
          eyebrow="Leaderboard"
          title="排行榜"
          description="支持当天、近 7 天、近 30 天切换，先看总榜，再看同标签榜。"
        >
          <Leaderboard
            data={data.leaderboardData}
            ownAccountIds={data.accountIds}
            ownContentDirections={data.ownContentDirections}
            currentDate={data.today}
            defaultRange="week"
            defaultCompact
          />
        </AppShellSection>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={3}>
        <AppShellSection
          eyebrow="Recent History"
          title="历史记录"
          description="最近 30 条数据，支持直接回看和修改。"
        >
          {!data.history || data.history.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="暂无历史记录"
              description="提交第一条数据后即可在此查看近 30 天历史"
            />
          ) : (
            <HistoryList
              history={data.history.map((report) => ({
                ...report,
                content: report.content ?? null,
                follower_convert: report.follower_convert ?? null,
              }))}
              accounts={data.accounts.map((account) => ({ id: account.id, name: account.display_name }))}
              accountDisplayNameMap={data.accountDisplayNameMap}
              today={data.today}
            />
          )}
        </AppShellSection>
      </DashboardAnimatedSection>
    </AppShell>
  );
}
