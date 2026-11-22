import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shiftDateOnly } from "@/lib/business-time";
import { measureAsync } from "@/lib/perf";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { filterLeaderboardByVisibleUsers } from "@/lib/dashboard-data-scope";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { createRequestContext } from "@/lib/request-context";
import { observeRequest } from "@/lib/observability";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";
import { loadCloudBaseLeaderboardRows } from "@/lib/loaders/cloudbase-leaderboard";
import { getMonthRange } from "@/lib/collaboration/domain/report-rules";

type DashboardPermissionContext = {
  scope: {
    visibleUserIds: string[];
  };
} | null;

export async function buildDashboardLeaderboardResponse({
  supabase,
  userId,
  permissionContext,
  visibleUserIds,
  year,
  month,
  now = new Date(),
  cloudBase = isCloudBaseBackend(),
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  permissionContext: DashboardPermissionContext;
  visibleUserIds?: string[];
  year?: number;
  month?: number;
  now?: Date;
  cloudBase?: boolean;
}) {
  if (!permissionContext) {
    return NextResponse.json({ error: "无法确定数据可见范围" }, { status: 403 });
  }
  const hasMonthFilter = year !== undefined || month !== undefined;
  const monthRange = hasMonthFilter ? getMonthRange(Number(year), Number(month)) : null;
  if (hasMonthFilter && !monthRange) {
    return NextResponse.json({ error: "year 或 month 参数不正确" }, { status: 400 });
  }
  const sinceDate = monthRange ? monthRange.start : shiftDateOnly(now, -30);
  const effectiveVisibleUserIds = visibleUserIds ?? permissionContext.scope.visibleUserIds;

  try {
    const [accountsResult, leaderboardResult] = await measureAsync("dashboard.leaderboard.queries", () => Promise.all([
      supabase
        .from("accounts")
        .select("id, content_direction")
        .eq("profile_id", userId)
        .order("created_at", { ascending: true }),
      // 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
      cloudBase
        ? loadCloudBaseLeaderboardRows(supabase, sinceDate, effectiveVisibleUserIds).then((data) => ({ data, error: null }))
        : supabase.rpc("get_leaderboard_rows", {
            since_date: sinceDate,
            ...(monthRange ? { until_date: monthRange.end } : {}),
          }),
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

    const visibleRows = filterLeaderboardByVisibleUsers(
      leaderboardResult.data ?? [],
      effectiveVisibleUserIds
    );
    const scopedRows = monthRange
      ? visibleRows.filter((row) => {
          const reportDate = String((row as { report_date?: unknown }).report_date ?? "").slice(0, 10);
          return reportDate >= monthRange.start && reportDate <= monthRange.end;
        })
      : visibleRows;

    return NextResponse.json({
      leaderboardData: scopedRows,
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

export async function GET(request: Request) {
  const context = createRequestContext({ request, route: "/api/dashboard/leaderboard", operation: "read" });
  return observeRequest(context, async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const permissionContext = await getCurrentPermissionContext("company", null);
    if (!permissionContext) {
      return NextResponse.json({ error: "无法确定数据可见范围" }, { status: 403 });
    }
    const adminClient = createAdminClient();
    let visibleUserIds: string[] | undefined;

    if (permissionContext) {
      try {
        const resolution = await resolveCollaborationScope(adminClient, permissionContext.scope);
        visibleUserIds = resolution.visibleUserIds;
      } catch {
        visibleUserIds = permissionContext.scope.visibleUserIds;
      }
    }

    const searchParams = new URL(request.url).searchParams;
    const rawYear = searchParams.get("year");
    const rawMonth = searchParams.get("month");
    const hasMonthParams = rawYear !== null || rawMonth !== null;

    // 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
    return buildDashboardLeaderboardResponse({
      supabase: isCloudBaseBackend() ? adminClient : supabase,
      userId: user.id,
      permissionContext,
      visibleUserIds,
      ...(hasMonthParams ? { year: Number(rawYear), month: Number(rawMonth) } : {}),
    });
  });
}
