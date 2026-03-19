import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import type { AccountLeaderboardRow } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { build个人趋势数据 } from "@/lib/趋势图";
import { 日报提交面板 } from "./日报提交面板";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { VideoSubmitPanel } from "./video-submit-panel";
import { AdvicePanel } from "./advice-panel";

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
    { data: userTodayReports },
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
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, uploaded_at, accounts(name)"
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

  function getAccountName(accountRelation: unknown) {
    if (Array.isArray(accountRelation)) {
      const firstAccount = accountRelation[0] as { name?: string | null } | undefined;
      return firstAccount?.name;
    }

    if (accountRelation && typeof accountRelation === "object") {
      return (accountRelation as { name?: string | null }).name;
    }

    return undefined;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <DashboardAnimatedSection index={0}>
        <div>
          <h1 className="text-2xl font-semibold">
            你好，{profile?.name ?? user.email}
          </h1>
        </div>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={1}>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>待办清单</CardTitle>
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
        <details className="group rounded-3xl border border-border/60 bg-background/85 shadow-sm backdrop-blur-md">
          <summary className="cursor-pointer list-none px-6 py-4 text-sm font-medium text-foreground marker:content-none">
            <div className="flex items-center justify-between gap-4">
              <span>旧版日报提交</span>
              <span className="text-xs text-muted-foreground transition group-open:rotate-180">⌄</span>
            </div>
          </summary>
          <div className="px-6 pb-6">
            <日报提交面板
              accounts={accounts ?? []}
              today={today}
              todayReports={userTodayReports ?? []}
            />
          </div>
        </details>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={4}>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>数据趋势</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ResultTrend
              data={trendData.结果趋势}
              personalLabel="我的数据"
              teamAverageLabel="团队 P70"
              emptyText="提交 2 天以上数据后可查看趋势图"
            />
            <InteractionTrend
              data={trendData.互动趋势}
              personalLabel="我的质量分"
              teamAverageLabel="团队 P70"
              emptyText="提交 2 天以上数据后可查看互动质量分趋势"
            />
          </CardContent>
        </Card>
      </DashboardAnimatedSection>

      <DashboardAnimatedSection index={5}>
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

      <DashboardAnimatedSection index={6}>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>历史记录（最近 30 条）</CardTitle>
          </CardHeader>
          <CardContent>
            {!history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无记录</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>账号</TableHead>
                        <TableHead>视频标题</TableHead>
                        <TableHead className="text-right">播放量</TableHead>
                        <TableHead className="text-right">完播率</TableHead>
                        <TableHead className="text-right">均播时长</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          2s跳出
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          5s完播
                        </TableHead>
                        <TableHead className="text-right">点赞</TableHead>
                        <TableHead className="text-right">评论</TableHead>
                        <TableHead className="text-right">分享</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          收藏
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((report) => {
                        const dateText = report.report_date?.slice(5);
                        const accountName = getAccountName(report.accounts);
                        return (
                          <TableRow key={report.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {dateText}
                            </TableCell>
                            <TableCell className="max-w-[120px] truncate text-muted-foreground">
                              {accountName ?? "-"}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate">
                              {report.title}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {report.play_count != null
                                ? `${(report.play_count / 10000).toFixed(2)}万`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {report.completion_rate ?? "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {report.avg_play_duration ?? "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden lg:table-cell">
                              {report.bounce_rate_2s ?? "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden lg:table-cell">
                              {report.completion_rate_5s ?? "-"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {report.likes}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {report.comments}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {report.shares}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden lg:table-cell">
                              {report.favorites}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {history.map((report) => (
                    <div
                      key={report.id}
                      className="space-y-2 rounded-lg border bg-background p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {report.report_date?.slice(5)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {getAccountName(report.accounts) ?? "-"}
                          </p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">
                          {report.play_count != null
                            ? `${(report.play_count / 10000).toFixed(2)}万`
                            : "-"}
                        </p>
                      </div>
                      <p className="truncate text-sm">{report.title}</p>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">完播率</p>
                          <p className="tabular-nums">{report.completion_rate ?? "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">点赞</p>
                          <p className="tabular-nums">{report.likes}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">评论</p>
                          <p className="tabular-nums">{report.comments}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">分享</p>
                          <p className="tabular-nums">{report.shares}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </DashboardAnimatedSection>
    </div>
  );
}
