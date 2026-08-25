import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import {
  getDashboardSubmittedDates,
  isDashboardReport,
  mergeDashboardReports,
  type DashboardReportRecord,
} from "@/app/(app)/dashboard/video-submit-panel-state";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { formatShanghaiDateOnly } from "./shared";

type DashboardActivitySupabase = SupabaseClient;

export type DashboardActivityReport = DashboardReportRecord;

export const DASHBOARD_REPORT_SELECT =
  "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at";

export interface DashboardActivityData {
  monthSubmittedDates: string[];
  monthReports: DashboardActivityReport[];
  history: DashboardActivityReport[];
}

export async function loadDashboardActivityData({
  supabase,
  userId,
}: {
  supabase: DashboardActivitySupabase;
  userId: string;
}): Promise<DashboardActivityData> {
  const accountsResult = await supabase
    .from("accounts")
    .select("id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });

  assertSupabaseQuerySucceeded(accountsResult.error, "加载账号失败");

  const accountIds = (accountsResult.data ?? []).map((account) => account.id).filter(Boolean);
  if (accountIds.length === 0) {
    return { monthSubmittedDates: [], monthReports: [], history: [] };
  }

  const today = formatShanghaiDateOnly(new Date());
  const monthStartDate = `${today.slice(0, 8)}01`;

  const [historyResult, monthDateRowsResult, monthHistoryResult] = await Promise.all([
    supabase
      .from("daily_reports")
      .select(DASHBOARD_REPORT_SELECT)
      .in("account_id", accountIds)
      .order("report_date", { ascending: false })
      .order("uploaded_at", { ascending: false })
      .limit(30),
    supabase
      .from("daily_reports")
      .select("report_date")
      .in("account_id", accountIds)
      .gte("report_date", monthStartDate)
      .lte("report_date", today),
    supabase
      .from("daily_reports")
      .select(DASHBOARD_REPORT_SELECT)
      .in("account_id", accountIds)
      .gte("report_date", monthStartDate)
      .lte("report_date", today)
      .order("report_date", { ascending: false })
      .order("uploaded_at", { ascending: false }),
  ]);

  assertSupabaseQuerySucceeded(historyResult.error, "加载历史记录失败");
  assertSupabaseQuerySucceeded(monthDateRowsResult.error, "加载本月提交日期失败");
  assertSupabaseQuerySucceeded(monthHistoryResult.error, "加载本月提交记录失败");

  const history = mergeDashboardReports({
    activityReports: ((historyResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardReport,
    ),
  });
  const monthReports = mergeDashboardReports({
    activityReports: ((monthHistoryResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardReport,
    ),
  });

  return {
    monthSubmittedDates: getDashboardSubmittedDates(
      ((monthDateRowsResult.data ?? []) as Array<{ report_date: string | null }>),
    ),
    monthReports,
    history,
  };
}
