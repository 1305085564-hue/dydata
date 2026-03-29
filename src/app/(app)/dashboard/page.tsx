import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import type { AccountLeaderboardRow } from "@/types";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { build个人趋势数据 } from "@/lib/趋势图";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock, GalleryVerticalEnd, ListChecks, Sparkles } from "lucide-react";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { VideoSubmitPanel } from "./video-submit-panel";
import { hasPendingExemptionRequest } from "./actions";
import { HistoryList } from "./history-list";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  const today = new Date().toISOString().split("T")[0];
  const accountIds = (accounts ?? []).map((account) => account.id);
  const ownContentDirections = Array.from(
    new Set(
      (accounts ?? [])
        .map((account) => account.content_direction?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  const [{ data: _userTodayReports }, { data: history }] = await Promise.all([
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
          )
          .in("account_id", accountIds)
          .eq("report_date", today)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(name)"
          )
          .in("account_id", accountIds)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
  ]);

  const todayReports = ((_userTodayReports ?? []) as TodaySubmissionReportLike[]).filter(
    (report) => typeof report.account_id === "string",
  );

  const monthAgoDate = new Date();
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().split("T")[0];

  const [{ data: leaderboardRows }, { data: teamHistory }, { data: activeProfiles }] = await Promise.all([
    supabase.rpc("get_leaderboard_rows", { since_date: monthAgo }),
    supabase
      .from("daily_reports")
      .select("report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites")
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, status"),
  ]);

  const activeUserIds = (activeProfiles ?? [])
    .filter((profile) => (profile.status ?? "active") === "active")
    .map((profile) => profile.id);

  const trendData = build个人趋势数据(
    (history ?? []).map((report) => ({
      report_date: report.report_date,
      user_id: user.id,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    })),
    (teamHistory ?? []).map((report) => ({
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

  const leaderboardData = (leaderboardRows ?? []) as AccountLeaderboardRow[];

  const hasPending = await hasPendingExemptionRequest();

  return (
    <div className="dashboard-shell mx-auto max-w-6xl space-y-6 px-1 pb-24 md:space-y-8 md:pb-0">
      <DashboardAnimatedSection index={0}>
        <div className="space-y-4">
          <VideoSubmitPanel
            accounts={accounts ?? []}
            userId={user.id}
            today={today}
            todayReports={todayReports}
            hasPendingExemption={hasPending}
          />

          <Card className="dashboard-surface dashboard-surface-panel card-elevated rounded-[1.35rem] border-0">
            <CardContent className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="dashboard-section-kicker inline-flex items-center gap-2">
                    <Sparkles className="size-3.5" />
                    今日操作
                  </p>
                  <p className="text-sm text-muted-foreground">按这个顺序操作更快，减少漏填和重复提交。</p>
                </div>
                <div className="dashboard-summary-chip text-xs sm:text-sm">
                  日期
                  <span className="font-semibold text-foreground">{today}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="dashboard-field-group flex items-start gap-3 rounded-2xl p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <ListChecks className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">先选账号</p>
                    <p className="text-xs text-muted-foreground">确认今天要提交的账号</p>
                  </div>
                </div>
                <div className="dashboard-field-group flex items-start gap-3 rounded-2xl p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <GalleryVerticalEnd className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">导入截图</p>
                    <p className="text-xs text-muted-foreground">自动回填，减少手动录入</p>
                  </div>
                </div>
                <div className="dashboard-field-group flex items-start gap-3 rounded-2xl p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Clock className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">提交并复查</p>
                    <p className="text-xs text-muted-foreground">提交后看状态卡是否已更新</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={1}>
        <Card className="dashboard-surface dashboard-surface-panel card-elevated rounded-[1.5rem] border-0">
          <CardHeader>
            <CardTitle>数据趋势</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ResultTrend
              data={trendData.结果趋势}
              personalLabel="我的数据"
              teamAverageLabel="团队 P80"
              emptyText="提交 2 天以上数据后可查看趋势图"
            />
            <InteractionTrend
              data={trendData.互动趋势}
              personalLabel="我的质量分"
              teamAverageLabel="团队 P80"
              emptyText="提交 2 天以上数据后可查看互动质量分趋势"
            />
          </CardContent>
        </Card>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={2}>
        <Card className="dashboard-surface dashboard-surface-panel card-elevated rounded-[1.5rem] border-0">
          <CardHeader>
            <CardTitle>账号排行榜</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard
              data={leaderboardData}
              ownAccountIds={accountIds}
              ownContentDirections={ownContentDirections}
              currentDate={today}
              defaultRange="week"
              defaultCompact
            />
          </CardContent>
        </Card>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={3}>
        <Card className="dashboard-surface dashboard-surface-panel card-elevated rounded-[1.5rem] border-0">
          <CardHeader>
            <CardTitle>历史记录（最近 30 条）</CardTitle>
          </CardHeader>
          <CardContent>
            {!history || history.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="暂无历史记录"
                description="提交第一条数据后即可在此查看近30天历史"
              />
            ) : (
              <HistoryList history={history} accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))} today={today} />
            )}
          </CardContent>
        </Card>
      </DashboardAnimatedSection>
    </div>
  );
}
