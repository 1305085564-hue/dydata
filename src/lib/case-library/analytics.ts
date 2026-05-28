import { createAdminClient } from "@/lib/supabase/admin";

export interface ScriptsTopRow {
  id: string;
  script_text: string;
  total_views: number;
  total_follows: number;
  usage_count: number;
  weighted_conversion_rate: number | null;
}

export interface ScriptsTabData {
  topScripts: ScriptsTopRow[];
  totalCases: number;
  conversionCases: number;
  usageCount: number;
  totalViews: number;
  totalFollows: number;
  averageConversionRate: number | null;
  weeklyNewUsageRecords: number;
}

type MinimalAnalyticsSupabase = {
  from: (table: string) => unknown;
};

type MinimalAnalyticsResult = {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
};

type MinimalAnalyticsQuery = {
  eq: (column: string, value: unknown) => MinimalAnalyticsQuery;
  gte: (column: string, value: string | number) => MinimalAnalyticsQuery;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => MinimalAnalyticsQuery;
  limit: (count: number) => MinimalAnalyticsQuery;
};

type MinimalAnalyticsSelectable = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => MinimalAnalyticsQuery;
};

type LoadScriptsTabDeps = {
  createAdminClient: () => MinimalAnalyticsSupabase;
};

const defaultDeps: LoadScriptsTabDeps = {
  createAdminClient: createAdminClient as unknown as LoadScriptsTabDeps["createAdminClient"],
};

function fromAnalyticsTable(supabase: MinimalAnalyticsSupabase, table: string) {
  return supabase.from(table) as MinimalAnalyticsSelectable;
}

function executeAnalyticsQuery(query: MinimalAnalyticsQuery) {
  return query as unknown as Promise<MinimalAnalyticsResult>;
}

export async function loadScriptsTab(
  weekStart: string,
  deps: LoadScriptsTabDeps = defaultDeps,
): Promise<ScriptsTabData> {
  const supabase = deps.createAdminClient();
  const [totalCasesResult, conversionCasesResult, weeklyUsageResult, topCasesResult] = await Promise.all([
    executeAnalyticsQuery(fromAnalyticsTable(supabase, "violation_cases")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false)),
    executeAnalyticsQuery(fromAnalyticsTable(supabase, "violation_cases")
      .select("total_views, total_follows, usage_count")
      .eq("is_deleted", false)
      .eq("purpose", "conversion")),
    executeAnalyticsQuery(fromAnalyticsTable(supabase, "script_usage_records")
      .select("id", { count: "exact", head: true })
      .gte("used_at", weekStart)),
    executeAnalyticsQuery(fromAnalyticsTable(supabase, "violation_cases")
      .select("id, script_text, total_views, total_follows, usage_count, weighted_conversion_rate")
      .eq("is_deleted", false)
      .eq("purpose", "conversion")
      .gte("usage_count", 3)
      .gte("total_views", 1000)
      .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
      .order("total_views", { ascending: false })
      .limit(10)),
  ]);

  const firstError =
    totalCasesResult.error ??
    conversionCasesResult.error ??
    weeklyUsageResult.error ??
    topCasesResult.error;

  if (firstError) {
    throw new Error("获取案例库 analytics 数据失败");
  }

  const conversionCases = (conversionCasesResult.data ?? []) as Array<{
    total_views?: number | null;
    total_follows?: number | null;
    usage_count?: number | null;
  }>;
  const totalViews = conversionCases.reduce((sum, item) => sum + Number(item.total_views ?? 0), 0);
  const totalFollows = conversionCases.reduce((sum, item) => sum + Number(item.total_follows ?? 0), 0);
  const usageCount = conversionCases.reduce((sum, item) => sum + Number(item.usage_count ?? 0), 0);

  return {
    topScripts: (topCasesResult.data ?? []) as ScriptsTopRow[],
    totalCases: totalCasesResult.count ?? 0,
    conversionCases: conversionCases.length,
    usageCount,
    totalViews,
    totalFollows,
    averageConversionRate: totalViews > 0 ? totalFollows / totalViews : null,
    weeklyNewUsageRecords: weeklyUsageResult.count ?? 0,
  };
}
