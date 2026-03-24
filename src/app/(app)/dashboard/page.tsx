import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import type { AccountLeaderboardRow } from "@/types";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { build个人趋势数据 } from "@/lib/趋势图";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock } from "lucide-react";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { VideoSubmitPanel } from "./video-submit-panel";
import { AdvicePanel } from "./advice-panel";
import { hasPendingExemptionRequest } from "./actions";
import { 申请豁免弹窗 } from "./申请豁免弹窗";
import { HistoryList } from "./history-list";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).single(),
    supabase
      .from("accounts")
      .select("id, name, content_direction")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const accountIds = (accounts ?? []).map((account) => account.id);
  const ownContentDirections = Array.from(
    new Set(
      (accounts ?? [])
        .map((account) => account.content_direction?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  const [
    { data: _userTodayReports },
    { data: history },
    { data: todayVideos },
    { data: allVideos },
    { data: videoSnapshots },
  ] = await Promise.all([
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
    accountIds.length
      ? supabase
          .from("videos")
          .select("id, account_id")
          .in("account_id", accountIds)
          .gte("created_at", todayStart)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase.from("videos").select("id").in("account_id", accountIds)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase
          .from("video_metrics_snapshots")
          .select("video_id")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] }),
  ]);

  const todaySubmittedAccountIds = new Set((todayVideos ?? []).map((video) => video.account_id));
  const pendingVideoCount = (accounts ?? []).filter((account) => !todaySubmittedAccountIds.has(account.id)).length;
  const snapshotVideoIds = new Set((videoSnapshots ?? []).map((snapshot) => snapshot.video_id));
  const pending24hCount = (allVideos ?? []).filter((video) => !snapshotVideoIds.has(video.id)).length;
  const allTasksCompleted = pendingVideoCount === 0 && pending24hCount === 0;

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
    <div className="mx-auto max-w-5xl space-y-8 pb-24 md:pb-0">
      <DashboardAnimatedSection index={0}>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-foreground">
            你好，{profile?.name ?? user.email}
            <span className="ml-3 text-sm font-normal text-muted-foreground hidden sm:inline-block">
              {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
            </span>
          </h1>
          <span className="text-sm text-muted-foreground sm:hidden">
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
          </span>
        </div>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={1}>
        <Card className="card-elevated">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>待办清单</CardTitle>
              <申请豁免弹窗 hasPending={hasPending} />
            </div>
          </CardHeader>
          <CardContent>
            {allTasksCompleted ? (
              <p className="text-sm font-medium text-emerald-600">✅ 今日任务已完成</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">◻</span>
                    <span>今日待提交视频</span>
                  </div>
                  <span className="font-semibold tabular-nums">{pendingVideoCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">◷</span>
                    <span>待补24h数据</span>
                  </div>
                  <span className="font-semibold tabular-nums">{pending24hCount}</span>
                </div>
                <AdvicePanel />
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={2}>
        <VideoSubmitPanel accounts={accounts ?? []} userId={user.id} today={today} />
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={3}>
        <Card className="card-elevated">
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

      <DashboardAnimatedSection index={4}>
        <Card className="card-elevated">
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

      <DashboardAnimatedSection index={5}>
        <Card className="card-elevated">
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
              <HistoryList history={history} accounts={(accounts ?? []).map(a => ({ id: a.id, name: a.name }))} today={today} />
            )}
          </CardContent>
        </Card>
      </DashboardAnimatedSection>
    </div>
  );
}
