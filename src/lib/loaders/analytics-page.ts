import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import { getPresetRange } from "@/lib/analytics-access";
import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { UserPermissionInfo } from "@/lib/permissions";

type AnalyticsSupabase = SupabaseClient;
type LoadMode = "initial" | "full";

export const ANALYTICS_FIRST_SCREEN_RPC = "admin_analytics_first_screen";
export const ANALYTICS_REPORT_SELECT =
  "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at";

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function shiftDays(dateString: string, days: number) {
  const next = new Date(`${dateString}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDate(next);
}

function getInclusiveRangeDays(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

export class AnalyticsRangeLimitError extends Error {
  readonly currentRangeDays: number;
  readonly maxRangeDays: number;

  constructor(currentRangeDays: number, maxRangeDays: number) {
    super(`经营分析首屏最多只支持 ${maxRangeDays} 天，当前请求为 ${currentRangeDays} 天`);
    this.name = "AnalyticsRangeLimitError";
    this.currentRangeDays = currentRangeDays;
    this.maxRangeDays = maxRangeDays;
  }
}

export function assertAnalyticsRangeWithinBudget(from: string, to: string) {
  const currentRangeDays = getInclusiveRangeDays(from, to);
  const maxRangeDays = ADMIN_FIRST_SCREEN_BUDGETS.analytics.maxRangeDays;
  if (currentRangeDays > maxRangeDays) {
    throw new AnalyticsRangeLimitError(currentRangeDays, maxRangeDays);
  }
  return currentRangeDays;
}

export interface AnalyticsPageData {
  range: ReturnType<typeof getPresetRange>;
  userId: string;
  role: string;
  isPrivilegedUser: boolean;
  currentUserName: string;
  submitters: string[];
  filteredReports: Array<{
    id: string;
    user_id: string;
    account_id?: string | null;
    submitter: string;
    title: string | null;
    report_date: string;
    play_count: number | null;
    completion_rate: string | null;
    avg_play_duration: string | null;
    bounce_rate_2s: string | null;
    completion_rate_5s: string | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    follower_gain: number | null;
    follower_convert: number | null;
    content?: string | null;
    published_at?: string | null;
    uploaded_at?: string;
    cover_url?: string | null;
  }>;
  previousPeriodReports: Array<{
    id: string;
    user_id: string;
    account_id?: string | null;
    submitter: string;
    title: string | null;
    report_date: string;
    play_count: number | null;
    completion_rate: string | null;
    avg_play_duration: string | null;
    bounce_rate_2s: string | null;
    completion_rate_5s: string | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    follower_gain: number | null;
    follower_convert: number | null;
    content?: string | null;
    published_at?: string | null;
    uploaded_at?: string;
    cover_url?: string | null;
  }>;
}

function emptyAnalyticsPayload(range: ReturnType<typeof getPresetRange>, userId: string): AnalyticsPageData {
  return {
    range,
    userId,
    role: "member",
    isPrivilegedUser: false,
    currentUserName: "我",
    submitters: [],
    filteredReports: [],
    previousPeriodReports: [],
  };
}

export async function loadAnalyticsPageData({
  supabase,
  userId,
  preset,
  from,
  to,
  permissionInfo,
  scope,
  mode = "initial",
}: {
  supabase?: AnalyticsSupabase;
  userId: string;
  preset: AnalyticsRangePreset;
  from?: string;
  to?: string;
  permissionInfo?: UserPermissionInfo;
  scope?: DataAccessScope;
  mode?: LoadMode;
}): Promise<AnalyticsPageData> {
  const range = getPresetRange(preset, new Date(), { from, to });
  const resolvedContext = scope
    ? { permissionInfo: permissionInfo ?? null, scope }
    : permissionInfo
      ? await buildPermissionContextFromPermissionInfo(permissionInfo)
      : null;

  if (!resolvedContext?.scope) {
    return emptyAnalyticsPayload(range, userId);
  }

  const currentRangeDays = assertAnalyticsRangeWithinBudget(range.from, range.to);
  const shouldLoadPreviousPeriod = currentRangeDays <= 90;
  const previousPeriodFrom = shiftDays(range.from, -currentRangeDays);
  const previousPeriodTo = shiftDays(range.from, -1);
  const client = supabase ?? createAdminClient();

  if (mode === "initial") {
    const { data, error } = await client.rpc(ANALYTICS_FIRST_SCREEN_RPC, {
      p_visible_user_ids: resolvedContext.scope.visibleUserIds,
      p_user_id: userId,
      p_role: resolvedContext.permissionInfo?.role ?? "member",
      p_current_user_name: resolvedContext.permissionInfo?.name ?? "我",
      p_from: range.from,
      p_to: range.to,
      p_should_load_previous_period: shouldLoadPreviousPeriod,
      p_previous_from: shouldLoadPreviousPeriod ? previousPeriodFrom : null,
      p_previous_to: shouldLoadPreviousPeriod ? previousPeriodTo : null,
    });

    if (!error && data && typeof data === "object") {
      const payload = data as Omit<AnalyticsPageData, "range" | "userId">;
      return {
        range,
        userId,
        role: payload.role,
        isPrivilegedUser: payload.isPrivilegedUser,
        currentUserName: payload.currentUserName,
        submitters: payload.submitters,
        filteredReports: payload.filteredReports,
        previousPeriodReports: payload.previousPeriodReports,
      };
    }
  }

  const reportsResult = await client
    .from("daily_reports")
    .select(ANALYTICS_REPORT_SELECT)
    .in("user_id", resolvedContext.scope.visibleUserIds)
    .gte("report_date", range.from)
    .lte("report_date", range.to)
    .order("report_date", { ascending: false });
  assertSupabaseQuerySucceeded(reportsResult.error, "加载经营分析报表失败");
  const reports = reportsResult.data;

  const previousPeriodResult = shouldLoadPreviousPeriod
    ? await client
        .from("daily_reports")
        .select(ANALYTICS_REPORT_SELECT)
        .in("user_id", resolvedContext.scope.visibleUserIds)
        .gte("report_date", previousPeriodFrom)
        .lte("report_date", previousPeriodTo)
        .order("report_date", { ascending: false })
    : { data: [], error: null };
  assertSupabaseQuerySucceeded(previousPeriodResult.error, "加载经营分析对比报表失败");
  const previousPeriodReports = previousPeriodResult.data;

  const filteredReports = ((reports ?? []) as AnalyticsPageData["filteredReports"]).map((report) => ({
    ...report,
    cover_url: null,
  }));
  const filteredPreviousPeriodReports = ((previousPeriodReports ?? []) as AnalyticsPageData["previousPeriodReports"]).map((report) => ({
    ...report,
    cover_url: null,
  }));
  const submitters = Array.from(
    new Set(
      filteredReports
        .map((report) => report.submitter)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
  const isPrivilegedUser = (resolvedContext.scope.accessLevel ?? 1) > 1;

  return {
    range,
    userId,
    role: resolvedContext.permissionInfo?.role ?? "member",
    isPrivilegedUser,
    currentUserName: resolvedContext.permissionInfo?.name ?? "我",
    submitters,
    filteredReports,
    previousPeriodReports: filteredPreviousPeriodReports,
  };
}

export const __internal = {
  ANALYTICS_FIRST_SCREEN_RPC,
  ANALYTICS_REPORT_SELECT,
  assertAnalyticsRangeWithinBudget,
  getInclusiveRangeDays,
};
