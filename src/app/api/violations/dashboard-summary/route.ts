import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUtcWeekStartIso,
  selectConversionTop3,
  mapRecentViolations,
  selectDangerousTop3,
  selectSafeTop3,
  type DashboardCaseRow,
  type DashboardConversionRow,
  type DashboardRecentRow,
} from "@/lib/violations/dashboard-summary";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";

type MinimalDashboardSupabase = {
  from: (table: string) => unknown;
};

type MinimalDashboardQueryResult = { data: unknown[] | null; error: unknown; count: number | null };

type MinimalDashboardQuery = {
  eq: (column: string, value: unknown) => MinimalDashboardQuery;
  gte: (column: string, value: string | number) => MinimalDashboardQuery;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => MinimalDashboardQuery;
  limit: (count: number) => MinimalDashboardQuery;
};

type MinimalDashboardSelectable = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => MinimalDashboardQuery;
};

type DashboardSummaryDeps = {
  getAuthenticatedContext: () => Promise<{ user: { id: string } | null }>;
  createAdminClient: () => MinimalDashboardSupabase;
};

const defaultDeps: DashboardSummaryDeps = {
  getAuthenticatedContext: getAuthenticatedContext as DashboardSummaryDeps["getAuthenticatedContext"],
  createAdminClient: createAdminClient as unknown as DashboardSummaryDeps["createAdminClient"],
};

function fromDashboardTable(supabase: MinimalDashboardSupabase, table: string) {
  return supabase.from(table) as MinimalDashboardSelectable;
}

function executeDashboardQuery(query: MinimalDashboardQuery) {
  return query as unknown as Promise<MinimalDashboardQueryResult>;
}

export async function buildDashboardSummaryResponse(deps: DashboardSummaryDeps = defaultDeps) {
  const { user } = await deps.getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const supabase = deps.createAdminClient();
  const weekStart = getUtcWeekStartIso();

  const [casesResult, weekViolationsResult, weekAllResult, recentResult, conversionResult] =
    await Promise.all([
      executeDashboardQuery(fromDashboardTable(supabase, "violation_cases")
        .select("id, script_text, pass_count, fail_count")
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")),

      executeDashboardQuery(fromDashboardTable(supabase, "violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .gte("created_at", weekStart)),

      executeDashboardQuery(fromDashboardTable(supabase, "violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .gte("created_at", weekStart)),

      executeDashboardQuery(fromDashboardTable(supabase, "violation_cases")
        .select(
          `id, script_text, created_at, risk_level,
           submitter:profiles!violation_cases_submitted_by_fkey(name)`,
        )
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(3)),

      executeDashboardQuery(fromDashboardTable(supabase, "violation_cases")
        .select("id, script_text, total_views, total_follows, usage_count, weighted_conversion_rate")
        .eq("is_deleted", false)
        .eq("purpose", "conversion")
        .eq("status", "verified")
        .gte("usage_count", 3)
        .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
        .limit(3)),
    ]);

  const firstError =
    casesResult.error ??
    weekViolationsResult.error ??
    weekAllResult.error ??
    recentResult.error ??
    conversionResult.error;

  if (firstError) {
    return jsonServerError("获取 Dashboard 数据失败");
  }

  const caseRows = (casesResult.data ?? []) as DashboardCaseRow[];
  const recentViolations = mapRecentViolations((recentResult.data ?? []) as DashboardRecentRow[]);
  const conversionTop3 = selectConversionTop3((conversionResult.data ?? []) as DashboardConversionRow[]);

  return NextResponse.json({
    data: {
      dangerousTop3: selectDangerousTop3(caseRows),
      safeTop3: selectSafeTop3(caseRows),
      conversionTop3,
      weeklyStats: {
        newViolations: weekViolationsResult.count ?? 0,
        newCases: weekAllResult.count ?? 0,
      },
      recentViolations,
    },
  });
}

export async function GET() {
  return buildDashboardSummaryResponse();
}
