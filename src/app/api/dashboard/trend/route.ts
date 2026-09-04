import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { build个人趋势数据 } from "@/lib/趋势图";
import { shiftDateOnly } from "@/lib/loaders/shared";
import { measureAsync } from "@/lib/perf";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import {
  assertSupabaseQuerySucceeded,
  fetchAllQueryPages,
} from "@/lib/supabase/query-error";

type DashboardPermissionContext = {
  scope: {
    visibleUserIds: string[];
  };
} | null;

export async function buildDashboardTrendResponse({
  supabase,
  userId,
  permissionContext,
  now = new Date(),
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  permissionContext: DashboardPermissionContext;
  now?: Date;
}) {
  if (!permissionContext) {
    return NextResponse.json({ error: "无法确定数据可见范围" }, { status: 403 });
  }
  const visibleUserIds = permissionContext.scope.visibleUserIds;
  const monthAgo = shiftDateOnly(now, -30);

  try {
    const [accountsResult, historyResult, teamReports, profilesResult] =
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
        fetchAllQueryPages(
          (from, to) => supabase
            .from("daily_reports")
            .select(
              "id, report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites"
            )
            .gte("report_date", monthAgo)
            .in("user_id", visibleUserIds)
            .order("report_date", { ascending: true })
            .order("user_id", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
          "读取团队趋势失败",
        ),
        supabase
          .from("profiles")
          .select("id, status")
          .in("id", visibleUserIds),
      ]));

    assertSupabaseQuerySucceeded(accountsResult.error, "读取趋势账号失败");
    assertSupabaseQuerySucceeded(historyResult.error, "读取个人趋势失败");
    assertSupabaseQuerySucceeded(profilesResult.error, "读取趋势成员失败");

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

    const mappedTeamReports = teamReports.map((report) => ({
      report_date: report.report_date,
      user_id: report.user_id,
      play_count: report.play_count,
        follower_gain: report.follower_gain,
        likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    }));

    const trendData = build个人趋势数据(selfReports, mappedTeamReports, activeUserIds);

    return NextResponse.json({ trendData, accountIds, activeUserCount: activeUserIds.length });
  } catch (error) {
    console.error("[dashboard/trend] failed to load trend data", error);
    return NextResponse.json(
      { error: "加载趋势失败" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return buildDashboardTrendResponse({
    supabase,
    userId: user.id,
    permissionContext: await getCurrentPermissionContext(),
  });
}
