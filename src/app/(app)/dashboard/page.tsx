import { redirect } from "next/navigation";
import { ArrowRight, Clock, GalleryVerticalEnd, ListChecks, TrendingUp } from "lucide-react";
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
            <div className="dashboard-summary-chip glass-panel text-xs sm:text-sm">
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

          <VideoSubmitPanel
            accounts={data.accounts}
            userId={data.userId}
            userDisplayName={data.userDisplayName}
            today={data.today}
            todayReports={data.todayReports}
            hasPendingExemption={data.hasPendingExemption}
          />

          <div className="glass-panel grid gap-2.5 p-3 sm:grid-cols-[auto_1fr] sm:items-center sm:p-4">
            <div className="dashboard-summary-chip glass-panel w-fit">
              今日操作
              <span className="font-semibold text-foreground">轻量流程</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {[
                {
                  title: "先选账号",
                  description: "确认今天要提交哪个账号",
                  icon: ListChecks,
                },
                {
                  title: "优先导截图",
                  description: "先回填关键数据，减少手输",
                  icon: GalleryVerticalEnd,
                },
                {
                  title: "提交后看状态",
                  description: "确认状态已更新成已提交",
                  icon: Clock,
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title} className="dashboard-field-group glass-panel flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden lg:flex lg:justify-end">
              <div className="dashboard-summary-chip glass-panel">
                趋势图在下方
                <ArrowRight className="size-3.5" />
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
            <div className="dashboard-summary-chip glass-panel">
              <TrendingUp className="size-3.5" />
              团队对比口径：P80
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultTrend
              data={data.trendData.结果趋势}
              personalLabel="我的数据"
              teamAverageLabel="团队 P70"
              emptyText="提交 2 天以上数据后可查看趋势图"
            />
            <InteractionTrend
              data={data.trendData.互动趋势}
              personalLabel="我的质量分"
              teamAverageLabel="团队 P70"
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
