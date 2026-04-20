import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, AppShellHero, AppShellMetricStrip } from "@/components/app-shell";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { VideoSubmitPanel } from "./video-submit-panel";
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
          title="优先完成今天的数据填报"
          description="首页聚焦当天填报主流程，先把今天的数据补齐，再按需查看趋势、排行榜和历史记录。"
          meta={
            <div className="glass-chip glass-panel text-xs sm:text-sm">
              日期
              <span className="font-semibold text-foreground">{data.today}</span>
            </div>
          }
        >
          <AppShellMetricStrip
            columns={4}
            items={[
              {
                label: "今日账号",
                value: data.summary.totalAccounts,
                hint: "今天需要关注的账号数量",
                tone: "primary",
              },
              {
                label: "已提交",
                value: data.summary.submittedCount,
                hint: "已完成今日填报",
                tone: "success",
              },
              {
                label: "待提交",
                value: data.summary.pendingCount,
                hint: "请优先补齐今日数据",
                tone: data.summary.pendingCount > 0 ? "warning" : "neutral",
              },
              {
                label: "历史记录",
                value: data.summary.historyCount,
                hint: "最近 30 条提交记录",
                tone: "neutral",
              },
            ]}
          />

          <VideoSubmitPanel
            accounts={data.accounts}
            userId={data.userId}
            today={data.today}
            todayReports={data.todayReports}
            monthReports={data.monthReports}
            history={data.history}
            trendData={data.trendData}
            leaderboardData={data.leaderboardData}
            accountIds={data.accountIds}
            ownContentDirections={data.ownContentDirections}
            accountDisplayNameMap={data.accountDisplayNameMap}
            hasPendingExemption={data.hasPendingExemption}
          />
        </AppShellHero>
      </DashboardAnimatedSection>
    </AppShell>
  );
}
