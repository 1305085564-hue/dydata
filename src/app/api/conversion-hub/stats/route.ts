import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";

function getWeekStartDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const { user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const supabase = createAdminClient();
  const weekStart = getWeekStartDate();

  const [
    totalCasesResult,
    conversionCasesResult,
    weeklyUsageResult,
    topCasesResult,
    recentEventsResult,
  ] = await Promise.all([
    supabase
      .from("violation_cases")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),
    supabase
      .from("violation_cases")
      .select("total_views, total_follows, usage_count")
      .eq("is_deleted", false)
      .eq("purpose", "conversion"),
    supabase
      .from("script_usage_records")
      .select("id", { count: "exact", head: true })
      .gte("used_at", weekStart),
    supabase
      .from("violation_cases")
      .select("id, script_text, total_views, total_follows, usage_count, weighted_conversion_rate")
      .eq("is_deleted", false)
      .eq("purpose", "conversion")
      .gte("usage_count", 3)
      .gte("total_views", 1000)
      .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
      .order("total_views", { ascending: false })
      .limit(10),
    supabase
      .from("violation_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", weekStart),
  ]);

  const firstError =
    totalCasesResult.error ??
    conversionCasesResult.error ??
    weeklyUsageResult.error ??
    topCasesResult.error ??
    recentEventsResult.error;

  if (firstError) {
    return jsonServerError("获取转化中心统计失败");
  }

  const conversionCases = conversionCasesResult.data ?? [];
  const totalViews = conversionCases.reduce((sum, item) => sum + Number(item.total_views ?? 0), 0);
  const totalFollows = conversionCases.reduce((sum, item) => sum + Number(item.total_follows ?? 0), 0);
  const usageCount = conversionCases.reduce((sum, item) => sum + Number(item.usage_count ?? 0), 0);

  return NextResponse.json({
    data: {
      total_cases: totalCasesResult.count ?? 0,
      conversion_cases: conversionCases.length,
      usage_count: usageCount,
      total_views: totalViews,
      total_follows: totalFollows,
      average_conversion_rate: totalViews > 0 ? totalFollows / totalViews : null,
      weekly_new_usage_records: weeklyUsageResult.count ?? 0,
      weekly_violation_events: recentEventsResult.count ?? 0,
      top_scripts: topCasesResult.data ?? [],
      week_start: weekStart,
    },
  });
}
