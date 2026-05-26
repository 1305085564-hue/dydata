import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUtcWeekStartIso,
  mapRecentViolations,
  selectDangerousTop3,
  selectSafeTop3,
  type DashboardCaseRow,
  type DashboardRecentRow,
} from "@/lib/violations/dashboard-summary";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";

export async function GET() {
  const { user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const supabase = createAdminClient();
  const weekStart = getUtcWeekStartIso();

  const [casesResult, weekViolationsResult, weekAllResult, recentResult] =
    await Promise.all([
      supabase
        .from("violation_cases")
        .select("id, script_text, pass_count, fail_count")
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified"),

      supabase
        .from("violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .gte("created_at", weekStart),

      supabase
        .from("violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .gte("created_at", weekStart),

      supabase
        .from("violation_cases")
        .select(
          `id, script_text, created_at, risk_level,
           submitter:profiles!violation_cases_submitted_by_fkey(name)`,
        )
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(3),
    ]);

  const firstError =
    casesResult.error ??
    weekViolationsResult.error ??
    weekAllResult.error ??
    recentResult.error;

  if (firstError) {
    return jsonServerError("获取 Dashboard 数据失败");
  }

  const caseRows = (casesResult.data ?? []) as DashboardCaseRow[];
  const recentViolations = mapRecentViolations((recentResult.data ?? []) as DashboardRecentRow[]);

  return NextResponse.json({
    data: {
      dangerousTop3: selectDangerousTop3(caseRows),
      safeTop3: selectSafeTop3(caseRows),
      weeklyStats: {
        newViolations: weekViolationsResult.count ?? 0,
        newCases: weekAllResult.count ?? 0,
      },
      recentViolations,
    },
  });
}
