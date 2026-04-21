import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountLeaderboardRow } from "@/types";
import { build个人趋势数据 } from "@/lib/趋势图";
import { hasPendingExemptionRequest } from "@/app/(app)/dashboard/actions";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import { formatDateOnly, getSafeAccountDisplayName, shiftDateOnly, uniqueNonEmpty } from "./shared";

type DashboardSupabase = SupabaseClient<any, "public", any>;

type DashboardAccountRow = {
  id: string;
  name: string;
  content_direction: string | null;
};

type DashboardHistoryRow = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

export interface DashboardPageData {
  today: string;
  isExternalUser: boolean;
  monthSubmittedDates: string[];
  monthReports: DashboardHistoryRow[];
  userId: string;
  userDisplayName: string;
  accounts: Array<DashboardAccountRow & { display_name: string }>;
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  ownContentDirections: string[];
  todayReports: TodaySubmissionReportLike[];
  history: DashboardHistoryRow[];
  leaderboardData: AccountLeaderboardRow[];
  trendData: ReturnType<typeof build个人趋势数据>;
  hasPendingExemption: boolean;
  summary: {
    totalAccounts: number;
    submittedCount: number;
    pendingCount: number;
    historyCount: number;
  };
}

export async function loadDashboardPageData({
  supabase,
  userId,
}: {
  supabase: DashboardSupabase;
  userId: string;
}): Promise<DashboardPageData> {
  const [{ data: accounts }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, content_direction")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("name").eq("id", userId).single(),
  ]);

  const userDisplayName = profile?.name?.trim() || "当前用户";
  const displayAccounts = ((accounts ?? []) as DashboardAccountRow[]).map((account, index, list) => ({
    ...account,
    name: account.name ?? "未命名账号",
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName,
      contentDirection: account.content_direction,
      index,
      total: list.length,
    }),
  }));

  const today = formatDateOnly(new Date());
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartDate = formatDateOnly(monthStart);
  const accountIds = displayAccounts.map((account) => account.id);
  const ownContentDirections = uniqueNonEmpty(displayAccounts.map((account) => account.content_direction));
  const accountDisplayNameMap = Object.fromEntries(displayAccounts.map((account) => [account.id, account.display_name]));
  const monthAgo = shiftDateOnly(new Date(), -30);

  const [
    { data: rawTodayReports },
    { data: history },
    { data: leaderboardRows },
    { data: teamHistory },
    { data: activeProfiles },
    { data: monthDateRows },
    { data: monthHistory },
    hasPendingExemption,
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
          )
          .in("account_id", accountIds)
          .eq("report_date", today)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
          )
          .in("account_id", accountIds)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
    supabase.rpc("get_leaderboard_rows", { since_date: monthAgo }),
    supabase
      .from("daily_reports")
      .select("report_date, user_id, play_count, follower_gain, likes, comments, shares, favorites")
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, status"),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select("report_date")
          .in("account_id", accountIds)
          .gte("report_date", monthStartDate)
          .lte("report_date", today)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
          )
          .in("account_id", accountIds)
          .gte("report_date", monthStartDate)
          .lte("report_date", today)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    hasPendingExemptionRequest(),
  ]);

  const todayReports = ((rawTodayReports ?? []) as TodaySubmissionReportLike[]).filter(
    (report) => typeof report.account_id === "string",
  );
  const submittedAccountIds = new Set(todayReports.map((report) => report.account_id).filter(Boolean));
  const activeUserIds = (activeProfiles ?? [])
    .filter((profile) => (profile.status ?? "active") === "active")
    .map((profile) => profile.id);

  const trendData = build个人趋势数据(
    ((history ?? []) as DashboardHistoryRow[]).map((report) => ({
      report_date: report.report_date,
      user_id: userId,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    })),
    (teamHistory ?? []).map((report) => ({
      report_date: report.report_date,
      user_id: report.user_id,
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
    })),
    activeUserIds,
  );

  return {
    today,
    isExternalUser: false,
    monthSubmittedDates: Array.from(
      new Set(
        ((monthDateRows ?? []) as Array<{ report_date: string | null }>)
          .map((report) => report.report_date)
          .filter((reportDate): reportDate is string => Boolean(reportDate)),
      ),
    ),
    monthReports: ((monthHistory ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      (report): report is DashboardHistoryRow => typeof report.account_id === "string",
    ),
    userId,
    userDisplayName,
    accounts: displayAccounts,
    accountIds,
    accountDisplayNameMap,
    ownContentDirections,
    todayReports,
    history: ((history ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      (report): report is DashboardHistoryRow => typeof report.account_id === "string",
    ),
    leaderboardData: (leaderboardRows ?? []) as AccountLeaderboardRow[],
    trendData,
    hasPendingExemption,
    summary: {
      totalAccounts: displayAccounts.length,
      submittedCount: submittedAccountIds.size,
      pendingCount: Math.max(displayAccounts.length - submittedAccountIds.size, 0),
      historyCount: (history ?? []).length,
    },
  };
}
