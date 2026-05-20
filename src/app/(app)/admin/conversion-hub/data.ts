import { canAccessAdminPath } from "@/lib/analytics-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { HubTabKey } from "./hub-shell";
import type { StatusFilter, ViolationsTabData } from "./tabs/violations-tab";
import type { ScriptsTabData, ScriptsTopRow } from "./tabs/scripts-tab";
import type { DecisionBucket, DecisionEntry } from "./weekly/view";
import type { AnalyticsRow, TrendDay } from "./analytics/view";
import type { ViolationReviewCase } from "../violations/review-list";

export const VALID_TABS: HubTabKey[] = ["scripts", "violations", "weekly", "analytics", "advice"];

export type SortBy = "rate" | "usage" | "views";
export type FormatFilter = "all" | "oral" | "visual" | "mixed";

interface WeeklyDecisionRow {
  generated_by: "ai" | "manual";
  promote: unknown;
  keep_testing: unknown;
  deprecate: unknown;
  ban: unknown;
  confirmed_at: string | null;
}

export function getWeekStartDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function normalizeTab(value: string | undefined): HubTabKey {
  return VALID_TABS.includes(value as HubTabKey) ? (value as HubTabKey) : "scripts";
}

export function normalizeStatus(value: string | undefined): StatusFilter {
  if (value === "all" || value === "verified" || value === "rejected" || value === "archived") return value;
  return "submitted";
}

export function normalizeSort(v: string | undefined): SortBy {
  if (v === "usage" || v === "views") return v;
  return "rate";
}

export function normalizeFormat(v: string | undefined): FormatFilter {
  if (v === "oral" || v === "visual" || v === "mixed") return v;
  return "all";
}

function normalizeBucketEntries(value: unknown): DecisionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): DecisionEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : typeof item.case_id === "string" ? item.case_id : null;
    const script =
      typeof item.script_text === "string"
        ? item.script_text
        : typeof item.script === "string"
          ? item.script
          : typeof item.preview === "string"
            ? item.preview
            : "";
    const reason = typeof item.reason === "string" ? item.reason : null;
    if (!id || !script) return [];
    return [{ id, script_text: script, reason }];
  });
}

function sortCases(cases: ViolationReviewCase[]): ViolationReviewCase[] {
  const rank: Record<string, number> = {
    submitted: 0,
    verified: 1,
    rejected: 2,
    archived: 3,
  };
  return [...cases].sort((a, b) => {
    const rankDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.reviewedAt ?? b.createdAt).getTime() - new Date(a.reviewedAt ?? a.createdAt).getTime();
  });
}

export async function loadViolationsTab(params: {
  status: StatusFilter;
  category: string;
  keyword: string;
}): Promise<ViolationsTabData> {
  const supabase = await createClient();
  let query = supabase
    .from("violation_cases")
    .select(
      "id, created_at, submitted_by, script_text, is_violation, category, account_name_snapshot, team_id, scene_description, result, pass_count, fail_count, status, risk_level, admin_conclusion, suggested_action, reviewed_at, is_deleted",
    )
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .order("created_at", { ascending: false })
    .limit(80);

  if (params.status !== "all") query = query.eq("status", params.status);
  if (params.category && params.category !== "全部") query = query.eq("category", params.category);
  if (params.keyword) query = query.ilike("script_text", `%${params.keyword}%`);

  const { data: caseRows, error } = await query;
  if (error) {
    return {
      cases: [],
      pendingCount: 0,
      status: params.status,
      category: params.category,
      keyword: params.keyword,
      errorMessage: error.message,
    };
  }

  const rows = (caseRows ?? []) as Array<{
    id: string;
    created_at: string;
    submitted_by: string;
    script_text: string;
    is_violation: boolean;
    category: string;
    account_name_snapshot: string | null;
    team_id: string | null;
    scene_description: string | null;
    result: string | null;
    pass_count: number | null;
    fail_count: number | null;
    status: ViolationReviewCase["status"];
    risk_level: ViolationReviewCase["riskLevel"];
    admin_conclusion: string | null;
    suggested_action: string | null;
    reviewed_at: string | null;
  }>;

  const submitterIds = Array.from(new Set(rows.map((row) => row.submitted_by).filter(Boolean)));
  const teamIds = Array.from(new Set(rows.map((row) => row.team_id).filter(Boolean))) as string[];

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    submitterIds.length > 0
      ? supabase.from("profiles").select("id, name").in("id", submitterIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
  const teamMap = new Map((teams ?? []).map((team) => [team.id, team.name]));

  const cases = sortCases(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      createdAtLabel: formatDate(row.created_at),
      submitterName: profileMap.get(row.submitted_by) ?? "未知成员",
      scriptText: row.script_text,
      isViolation: row.is_violation,
      category: row.category,
      accountName: row.account_name_snapshot,
      teamName: row.team_id ? teamMap.get(row.team_id) ?? "未知团队" : null,
      sceneDescription: row.scene_description,
      result: row.result,
      passCount: row.pass_count ?? 0,
      failCount: row.fail_count ?? 0,
      status: row.status,
      riskLevel: row.risk_level,
      adminConclusion: row.admin_conclusion,
      suggestedAction: row.suggested_action,
      reviewedAt: row.reviewed_at,
      reviewedAtLabel: formatDate(row.reviewed_at),
    })),
  );

  const pendingCount =
    params.status === "submitted"
      ? cases.length
      : cases.filter((item) => item.status === "submitted").length;

  return {
    cases,
    pendingCount,
    status: params.status,
    category: params.category,
    keyword: params.keyword,
  };
}

export async function loadViolationsPendingCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("violation_cases")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .eq("status", "submitted");

  return count ?? 0;
}

export async function loadScriptsTab(weekStart: string): Promise<ScriptsTabData> {
  const supabase = createAdminClient();
  const [totalCasesResult, conversionCasesResult, weeklyUsageResult, topCasesResult] = await Promise.all([
    supabase.from("violation_cases").select("id", { count: "exact", head: true }).eq("is_deleted", false),
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
  ]);

  const conversionCases = conversionCasesResult.data ?? [];
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

export async function loadWeeklyTab(weekStart: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("weekly_decisions")
    .select("generated_by, promote, keep_testing, deprecate, ban, confirmed_at")
    .eq("week_start", weekStart)
    .maybeSingle<WeeklyDecisionRow>();

  const buckets: DecisionBucket[] | null = data
    ? [
        { key: "promote", label: "推广", emoji: "🚀", tone: "success", entries: normalizeBucketEntries(data.promote) },
        { key: "keep_testing", label: "继续测试", emoji: "🧪", tone: "info", entries: normalizeBucketEntries(data.keep_testing) },
        { key: "deprecate", label: "废弃", emoji: "🗑️", tone: "neutral", entries: normalizeBucketEntries(data.deprecate) },
        { key: "ban", label: "封禁", emoji: "⛔", tone: "danger", entries: normalizeBucketEntries(data.ban) },
      ]
    : null;

  return {
    buckets,
    confirmedAt: data?.confirmed_at ?? null,
    generatedBy: data?.generated_by ?? null,
  };
}

function last7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function loadAnalyticsTab(sort: SortBy, format: FormatFilter) {
  const supabase = createAdminClient();
  let query = supabase
    .from("violation_cases")
    .select("id, script_text, script_format, total_views, total_follows, usage_count, weighted_conversion_rate")
    .eq("is_deleted", false)
    .eq("purpose", "conversion")
    .gte("usage_count", 3)
    .gte("total_views", 1000);

  if (format !== "all") query = query.eq("script_format", format);

  if (sort === "usage") query = query.order("usage_count", { ascending: false });
  else if (sort === "views") query = query.order("total_views", { ascending: false });
  else
    query = query
      .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
      .order("total_views", { ascending: false });

  const rowsResult = await query.limit(20);

  const startIso = last7Days()[0];
  const eventsResult = await supabase
    .from("violation_events")
    .select("occurred_at")
    .gte("occurred_at", startIso);

  const countByDay = new Map<string, number>();
  for (const day of last7Days()) countByDay.set(day, 0);
  for (const ev of eventsResult.data ?? []) {
    const d = String(ev.occurred_at ?? "").slice(0, 10);
    if (countByDay.has(d)) countByDay.set(d, (countByDay.get(d) ?? 0) + 1);
  }
  const trend: TrendDay[] = Array.from(countByDay.entries()).map(([date, count]) => ({ date, count }));

  return {
    rows: (rowsResult.data ?? []) as AnalyticsRow[],
    trend,
  };
}

export interface ConversionHubLoadParams {
  activeTab: HubTabKey;
  status: StatusFilter;
  category: string;
  keyword: string;
  sort: SortBy;
  format: FormatFilter;
  weekStart: string;
  includeViolations: boolean;
}

export async function loadConversionHubData(params: ConversionHubLoadParams) {
  const [violations, pendingViolationsCount, scripts, weekly, analytics] = await Promise.all([
    params.activeTab === "violations" && params.includeViolations
      ? loadViolationsTab({ status: params.status, category: params.category, keyword: params.keyword })
      : Promise.resolve(null),
    params.activeTab === "violations" || !params.includeViolations
      ? Promise.resolve(0)
      : loadViolationsPendingCount(),
    params.activeTab === "scripts" ? loadScriptsTab(params.weekStart) : Promise.resolve(null),
    params.activeTab === "weekly" ? loadWeeklyTab(params.weekStart) : Promise.resolve(null),
    params.activeTab === "analytics" ? loadAnalyticsTab(params.sort, params.format) : Promise.resolve(null),
  ]);

  return { violations, pendingViolationsCount, scripts, weekly, analytics };
}

export { canAccessAdminPath };
