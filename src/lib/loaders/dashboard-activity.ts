import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import {
  isDashboardReport,
  mergeDashboardReports,
  type DashboardReportRecord,
} from "@/app/(app)/dashboard/video-submit-panel-state";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

type DashboardActivitySupabase = SupabaseClient;

export type DashboardActivityReport = DashboardReportRecord;

export const DASHBOARD_REPORT_SELECT =
  "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at";

// 当月日报已由 /dashboard 首屏 loader 随页面注入（同口径同范围查询），
// 本接口只回历史增量，避免同一业务事实在一次加载里查两遍（总纲"同一事实只计算一次"）。
export interface DashboardActivityData {
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
    return { history: [] };
  }

  const historyResult = await supabase
    .from("daily_reports")
    .select(DASHBOARD_REPORT_SELECT)
    .in("account_id", accountIds)
    .order("report_date", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .limit(30);

  assertSupabaseQuerySucceeded(historyResult.error, "加载历史记录失败");

  const history = mergeDashboardReports({
    activityReports: ((historyResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardReport,
    ),
  });

  return { history };
}
