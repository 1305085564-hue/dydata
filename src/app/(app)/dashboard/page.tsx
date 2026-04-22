import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, AppShellHero } from "@/components/app-shell";
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
        >
          <VideoSubmitPanel
            accounts={data.accounts}
            userId={data.userId}
            userDisplayName={data.userDisplayName}
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
            userExemptionProfile={data.userExemptionProfile}
          />
        </AppShellHero>
      </DashboardAnimatedSection>
    </AppShell>
  );
}
