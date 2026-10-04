import type { SupabaseClient } from "@supabase/supabase-js";

const RECENT_USER_DAILY_REPORT_SELECT =
  "id, report_date, play_count, likes, comments, shares, favorites, follower_gain";

export function loadRecentUserDailyReports(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("daily_reports")
    .select(RECENT_USER_DAILY_REPORT_SELECT)
    .eq("user_id", userId)
    .eq("is_void", false)
    .order("report_date", { ascending: false })
    .limit(10);
}

export function loadDailyReportUserIdsForDate(
  supabase: SupabaseClient,
  date: string,
  userIds: string[],
) {
  return supabase
    .from("daily_reports")
    .select("user_id")
    .eq("report_date", date)
    .in("user_id", userIds);
}

export function loadActiveDailyReports(
  supabase: SupabaseClient,
  userIds: string[],
  range: { start?: string; end?: string } = {},
) {
  let query = supabase
    .from("daily_reports")
    .select("id, user_id, report_date, play_count")
    .eq("is_void", false)
    .order("report_date", { ascending: false })
    .limit(500);

  query = query.in("user_id", userIds);
  if (range.start) query = query.gte("report_date", range.start);
  if (range.end) query = query.lte("report_date", range.end);
  return query;
}

export function loadDailyReportForCorrection(supabase: SupabaseClient, metricsId: string) {
  return supabase
    .from("daily_reports")
    .select("id, user_id, report_date, title, play_count")
    .eq("id", metricsId)
    .single();
}

export function countDailyReportsForUser(supabase: SupabaseClient, userId: string) {
  return supabase.from("daily_reports").select("id").eq("user_id", userId);
}

export function loadDailyReportForUser(
  supabase: SupabaseClient,
  dailyReportId: string,
) {
  return supabase
    .from("daily_reports")
    .select("id, user_id, account_id")
    .eq("id", dailyReportId)
    .eq("is_void", false)
    .single();
}
