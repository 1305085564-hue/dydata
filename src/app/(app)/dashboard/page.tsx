import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardForm } from "./dashboard-form";
import { TrendChart } from "./trend-chart";
import { Leaderboard } from "./leaderboard";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const today = new Date().toISOString().split("T")[0];

  const { data: todayReport } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("report_date", today)
    .maybeSingle();

  const { data: history } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("report_date", { ascending: false })
    .limit(30);

  const hasSubmittedToday = !!todayReport;

  // 排行榜数据：当天、近7天和近30天
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [{ data: todayReports }, { data: weekReports }, { data: monthReports }, { data: teamHistory }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("submitter, play_count, likes, comments, shares, favorites")
      .eq("report_date", today),
    supabase
      .from("daily_reports")
      .select("submitter, play_count, likes, comments, shares, favorites")
      .gte("report_date", weekAgo),
    supabase
      .from("daily_reports")
      .select("submitter, play_count, likes, comments, shares, favorites")
      .gte("report_date", monthAgo),
    // 团队 P70 分位线：近30天全团队数据
    supabase
      .from("daily_reports")
      .select("report_date, play_count, likes, comments, shares, favorites")
      .gte("report_date", monthAgo),
  ]);

  function aggregate(reports: typeof weekReports) {
    const map = new Map<string, { total_play: number; total_likes: number; total_comments: number; total_shares: number; total_favorites: number; count: number }>();
    for (const r of reports ?? []) {
      const key = r.submitter ?? "未知";
      const cur = map.get(key) ?? { total_play: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_favorites: 0, count: 0 };
      cur.total_play += r.play_count ?? 0;
      cur.total_likes += r.likes ?? 0;
      cur.total_comments += r.comments ?? 0;
      cur.total_shares += r.shares ?? 0;
      cur.total_favorites += r.favorites ?? 0;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d }));
  }

  const todayRank = aggregate(todayReports);
  const weekRank = aggregate(weekReports);
  const monthRank = aggregate(monthReports);

  // 计算团队分位线（P50/P70/P90，按日期分组）
  function computePercentiles(reports: typeof teamHistory) {
    const byDate = new Map<string, number[]>();
    const byDateEng = new Map<string, number[]>();
    for (const r of reports ?? []) {
      const d = r.report_date;
      if (!byDate.has(d)) { byDate.set(d, []); byDateEng.set(d, []); }
      byDate.get(d)!.push(r.play_count ?? 0);
      byDateEng.get(d)!.push((r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.favorites ?? 0));
    }
    function pct(sorted: number[], p: number) {
      const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
      return sorted[idx];
    }
    const result: Record<string, { p50_play: number; p70_play: number; p90_play: number; p50_eng: number; p70_eng: number; p90_eng: number }> = {};
    for (const [date, values] of byDate) {
      const sorted = [...values].sort((a, b) => a - b);
      const engSorted = [...byDateEng.get(date)!].sort((a, b) => a - b);
      result[date] = {
        p50_play: pct(sorted, 0.5), p70_play: pct(sorted, 0.7), p90_play: pct(sorted, 0.9),
        p50_eng: pct(engSorted, 0.5), p70_eng: pct(engSorted, 0.7), p90_eng: pct(engSorted, 0.9),
      };
    }
    return result;
  }
  const teamPercentiles = computePercentiles(teamHistory);

  return (
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">
              你好，{profile?.name ?? user.email}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {hasSubmittedToday ? (
                <span className="text-green-600">✅ 今日已提交</span>
              ) : (
                <span className="text-orange-500">⚠️ 今日尚未提交</span>
              )}
            </p>
          </div>

          {/* 表单区域 */}
          <section>
            <h2 className="text-lg font-semibold mb-4">提交日报</h2>
            {hasSubmittedToday ? (
              <div>
                <div className="rounded-xl border bg-green-50 border-green-200 px-4 py-3 mb-4">
                  <p className="text-sm text-green-700">今日数据已提交。如需补交其他日期，可修改日期后提交。</p>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-primary hover:underline mb-4 inline-block">修改今日数据</summary>
                  <DashboardForm userId={user.id} today={today} existingData={todayReport} />
                </details>
              </div>
            ) : (
              <DashboardForm userId={user.id} today={today} existingData={null} />
            )}
          </section>

        {/* 趋势图 */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>数据趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              history={(history ?? []).map((r) => ({
                report_date: r.report_date,
                play_count: r.play_count,
                likes: r.likes,
                comments: r.comments,
                shares: r.shares,
                favorites: r.favorites,
              }))}
              teamPercentiles={teamPercentiles}
            />
          </CardContent>
        </Card>

        {/* 排行榜 */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>团队排行榜</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard todayData={todayRank} weekData={weekRank} monthData={monthRank} />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>历史记录（最近 30 条）</CardTitle>
          </CardHeader>
          <CardContent>
            {!history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无记录</p>
            ) : (
              <>
                {/* 桌面端表格 */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>视频标题</TableHead>
                        <TableHead className="text-right">播放量</TableHead>
                        <TableHead className="text-right">完播率</TableHead>
                        <TableHead className="text-right">均播时长</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">2s跳出</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">5s完播</TableHead>
                        <TableHead className="text-right">点赞</TableHead>
                        <TableHead className="text-right">评论</TableHead>
                        <TableHead className="text-right">分享</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">收藏</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((r) => {
                        const d = r.report_date?.slice(5);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{d}</TableCell>
                            <TableCell className="max-w-[160px] truncate">{r.title}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{r.play_count != null ? (r.play_count / 10000).toFixed(2) + "万" : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.completion_rate ?? "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.avg_play_duration ?? "-"}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell tabular-nums">{r.bounce_rate_2s ?? "-"}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell tabular-nums">{r.completion_rate_5s ?? "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.likes}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.comments}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.shares}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell tabular-nums">{r.favorites}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* 手机端卡片 */}
                <div className="md:hidden space-y-3">
                  {history.map((r) => (
                    <div key={r.id} className="rounded-lg border bg-background p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{r.report_date?.slice(5)}</p>
                        <p className="text-sm font-semibold tabular-nums">{r.play_count != null ? (r.play_count / 10000).toFixed(2) + "万" : "-"}</p>
                      </div>
                      <p className="text-sm truncate">{r.title}</p>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">完播率</p>
                          <p className="tabular-nums">{r.completion_rate ?? "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">点赞</p>
                          <p className="tabular-nums">{r.likes}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">评论</p>
                          <p className="tabular-nums">{r.comments}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">分享</p>
                          <p className="tabular-nums">{r.shares}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
