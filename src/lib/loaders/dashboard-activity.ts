import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import { formatDateOnly } from "./shared";

type DashboardActivitySupabase = SupabaseClient;

export type DashboardActivityReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

const DASHBOARD_REPORT_SELECT =
  "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at";

function isDashboardActivityReport(
  report: TodaySubmissionReportLike & { id: string },
): report is DashboardActivityReport {
  return typeof report.account_id === "string";
}

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
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });

  const accountIds = (accounts ?? []).map((account) => account.id).filter(Boolean);
  if (accountIds.length === 0) {
    return { monthSubmittedDates: [], monthReports: [], history: [] };
  }

  const today = formatDateOnly(new Date());
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartDate = formatDateOnly(monthStart);

  const [{ data: history }, { data: monthDateRows }, { data: monthHistory }] = await Promise.all([
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

  return {
    monthSubmittedDates: Array.from(
      new Set(
        ((monthDateRows ?? []) as Array<{ report_date: string | null }>)
          .map((report) => report.report_date)
          .filter((reportDate): reportDate is string => Boolean(reportDate)),
      ),
    ),
    monthReports: ((monthHistory ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardActivityReport,
    ),
    history: ((history ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardActivityReport,
    ),
  };
}
