import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/lib/dashboard-submission-state";
import {
  isDashboardReport,
  type DashboardReportRecord,
} from "@/lib/dashboard-submission-state";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

type DashboardActivitySupabase = SupabaseClient;

export type DashboardActivityReport = DashboardReportRecord;

export const DASHBOARD_REPORT_SELECT =
  "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, data_source";

// 当月日报已由 /dashboard 首屏 loader 随页面注入（同口径同范围查询），
// 本接口只回历史增量，避免同一业务事实在一次加载里查两遍（总纲"同一事实只计算一次"）。
export interface DashboardActivityData {
  history: DashboardActivityReport[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function loadDashboardActivityData({
  supabase,
  userId,
  page = 1,
  pageSize = 30,
}: {
  supabase: DashboardActivitySupabase;
  userId: string;
  page?: number;
  pageSize?: number;
}): Promise<DashboardActivityData> {
  const accountsResult = await supabase
    .from("accounts")
    .select("id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });

  assertSupabaseQuerySucceeded(accountsResult.error, "加载账号失败");

  const accountIds = (accountsResult.data ?? []).map((account) => account.id).filter(Boolean);
  if (accountIds.length === 0) {
    return { history: [], page, pageSize, hasMore: false };
  }

  const offset = (page - 1) * pageSize;
  const historyResult = await supabase
    .from("daily_reports")
    .select(DASHBOARD_REPORT_SELECT)
    .in("account_id", accountIds)
    .eq("is_void", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("uploaded_at", { ascending: false })
    .range(offset, offset + pageSize);

  assertSupabaseQuerySucceeded(historyResult.error, "加载历史记录失败");

  // 同一账号同一归属日允许多条作品（见 552db0dc），这里按作品行去重；
  // mergeDashboardReports 的「账号+归属日」键会把同一天的多条作品压成一条，不适用于历史列表。
  const rows = (historyResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>;
  const history = Array.from(new Map(rows.filter(isDashboardReport).map((row) => [row.id, row])).values());

  return {
    history: history.slice(0, pageSize),
    page,
    pageSize,
    hasMore: history.length > pageSize,
  };
}
