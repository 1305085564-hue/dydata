import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { build个人趋势数据 } from "@/lib/趋势图";
import { shiftDateOnly } from "@/lib/loaders/shared";
import { measureAsync } from "@/lib/perf";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";

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
    const [accountsResult, historyResult, teamHistoryResult, profilesResult] =
      await measureAsync("dashboard.trend.queries", () => Promise.all([
        supabase
          .from("accounts")
          .select("id")
          .eq("profile_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("daily_reports")
          .select(
            "report_date, play_count, follower_gain, likes, comments, shares, favorites"
          )
          .eq("user_id", userId)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
          .limit(30),
        supabase
          .from("daily_reports")
          .select(
            "report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites"
          )
          .gte("report_date", monthAgo)
          .in("user_id", visibleUserIds),
        supabase
          .from("profiles")
          .select("id, status")
          .in("id", visibleUserIds),
      ]));

    const accountIds = (accountsResult.data ?? []).map((a) => a.id);
    const activeUserIds = (profilesResult.data ?? [])
      .filter((p) => (p.status ?? "active") === "active")
      .map((p) => p.id);

    const selfReports =
      (historyResult.data ?? []).map((report) => ({
        report_date: report.report_date,
        user_id: userId,
        play_count: report.play_count,
        follower_gain: report.follower_gain,
        likes: report.likes,
        comments: report.comments,
        shares: report.shares,
        favorites: report.favorites,
      })) ?? [];

    const teamReports =
      (teamHistoryResult.data ?? []).map((report) => ({
        report_date: report.report_date,
        user_id: report.user_id,
        play_count: report.play_count,
        follower_gain: report.follower_gain,
        likes: report.likes,
        comments: report.comments,
        shares: report.shares,
        favorites: report.favorites,
      })) ?? [];

    const trendData = build个人趋势数据(selfReports, teamReports, activeUserIds);

    return NextResponse.json({ trendData, accountIds, activeUserCount: activeUserIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载趋势失败" },
      { status: 500 }
    );
  }
}
