import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { build个人趋势数据 } from "@/lib/趋势图";
import { shiftDateOnly } from "@/lib/loaders/shared";
import { measureAsync } from "@/lib/perf";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { filterLeaderboardByVisibleUsers } from "@/lib/dashboard-data-scope";

function buildConclusion(trendData: ReturnType<typeof build个人趋势数据>, leaderboardData: unknown[]) {
  const latest = trendData.结果趋势.at(-1);
  if (!latest) {
    return "近 30 天暂无可对比数据。";
  }

  const selfPlay = latest.playCount ?? 0;
  const companyPlay = latest.playCountTeamAverage ?? 0;
  const relation = selfPlay >= companyPlay ? "不低于公司优质线" : "低于公司优质线";
  return `最近一天播放 ${selfPlay}，${relation}；当前排行榜返回 ${leaderboardData.length} 条可展开明细。`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = user.id;
  const permissionContext = await getCurrentPermissionContext();
  if (!permissionContext) {
    return NextResponse.json({ error: "无法确定数据可见范围" }, { status: 403 });
  }
  const visibleUserIds = permissionContext.scope.visibleUserIds;
  const monthAgo = shiftDateOnly(new Date(), -30);

  try {
    const [accountsResult, historyResult, teamHistoryResult, profilesResult, leaderboardResult] =
      await measureAsync("dashboard.watch_overview.queries", () => Promise.all([
        supabase
          .from("accounts")
          .select("id, content_direction")
          .eq("profile_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("daily_reports")
          .select("report_date, play_count, follower_gain, likes, comments, shares, favorites")
          .eq("user_id", userId)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
          .limit(30),
        supabase
          .from("daily_reports")
          .select("report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites")
          .gte("report_date", monthAgo)
          .in("user_id", visibleUserIds),
        supabase
          .from("profiles")
          .select("id, status")
          .in("id", visibleUserIds),
        supabase.rpc("get_leaderboard_rows", { since_date: monthAgo }),
      ]));

    const accountIds = (accountsResult.data ?? []).map((account) => account.id);
    const ownContentDirections = Array.from(
      new Set(
        (accountsResult.data ?? [])
          .map((account) => account.content_direction)
          .filter((direction): direction is string => Boolean(direction)),
      ),
    );
    const activeUserIds = (profilesResult.data ?? [])
      .filter((profile) => (profile.status ?? "active") === "active")
      .map((profile) => profile.id);

    const selfReports = (historyResult.data ?? []).map((report) => ({
      report_date: report.report_date,
      user_id: userId,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    }));
    const teamReports = (teamHistoryResult.data ?? []).map((report) => ({
      report_date: report.report_date,
      user_id: report.user_id,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    }));

    const trendData = build个人趋势数据(selfReports, teamReports, activeUserIds);
    const leaderboardData = filterLeaderboardByVisibleUsers(
      leaderboardResult.data ?? [],
      visibleUserIds
    );

    return NextResponse.json({
      conclusion: buildConclusion(trendData, leaderboardData),
      trendData,
      leaderboardData,
      accountIds,
      ownContentDirections,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载看态大盘失败" },
      { status: 500 },
    );
  }
}
