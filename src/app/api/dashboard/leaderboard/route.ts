import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { shiftDateOnly } from "@/lib/loaders/shared";
import { measureAsync } from "@/lib/perf";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { filterLeaderboardByVisibleUsers } from "@/lib/dashboard-data-scope";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

type DashboardPermissionContext = {
  scope: {
    visibleUserIds: string[];
  };
} | null;

export async function buildDashboardLeaderboardResponse({
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
  const monthAgo = shiftDateOnly(now, -30);

  try {
    const [accountsResult, leaderboardResult] = await measureAsync("dashboard.leaderboard.queries", () => Promise.all([
      supabase
        .from("accounts")
        .select("id, content_direction")
        .eq("profile_id", userId)
        .order("created_at", { ascending: true }),
      supabase.rpc("get_leaderboard_rows", { since_date: monthAgo }),
    ]));

    assertSupabaseQuerySucceeded(accountsResult.error, "读取排行榜账号失败");
    assertSupabaseQuerySucceeded(leaderboardResult.error, "读取排行榜数据失败");

    const accountIds = (accountsResult.data ?? []).map((a) => a.id);
    const ownContentDirections = Array.from(
      new Set(
        (accountsResult.data ?? [])
          .map((a) => a.content_direction)
          .filter((d): d is string => Boolean(d))
      )
    );

    return NextResponse.json({
      leaderboardData: filterLeaderboardByVisibleUsers(
        leaderboardResult.data ?? [],
        permissionContext.scope.visibleUserIds
      ),
      accountIds,
      ownContentDirections,
    });
  } catch (error) {
    console.error("[dashboard/leaderboard] failed to load leaderboard data", error);
    return NextResponse.json(
      { error: "加载排行榜失败" },
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

  return buildDashboardLeaderboardResponse({
    supabase,
    userId: user.id,
    permissionContext: await getCurrentPermissionContext(),
  });
}
