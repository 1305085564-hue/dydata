import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountLeaderboardRow } from "@/types";
import { build个人趋势数据 } from "@/lib/趋势图";
import { hasPendingExemptionRequest } from "@/app/(app)/dashboard/actions";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import {
  getExemptionStateForDate,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import { formatDateOnly, getSafeAccountDisplayName, shiftDateOnly, uniqueNonEmpty } from "./shared";

type DashboardSupabase = SupabaseClient<unknown, "public", unknown>;

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
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
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
    supabase
      .from("profiles")
      .select("name, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category")
      .eq("id", userId)
      .single(),
  ]);

  const userDisplayName = profile?.name?.trim() || "当前用户";
  const userExemptionProfile: ExemptionProfileLike = {
    id: userId,
    status: profile?.status ?? "active",
    exempt_type: profile?.exempt_type ?? null,
    exempt_start_date: profile?.exempt_start_date ?? null,
    exempt_end_date: profile?.exempt_end_date ?? null,
    exempt_reason: profile?.exempt_reason ?? null,
    exemption_category: profile?.exemption_category ?? null,
  };
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
    { data: exemptionGrants },
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
    supabase
      .from("exemption_grant")
      .select("user_id, start_date, end_date, grant_type, exemption_category, status, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    hasPendingExemptionRequest(),
  ]);

  const userExemptionGrants = (exemptionGrants ?? []) as ExemptionGrantLike[];

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

  const todayExemptionState = getExemptionStateForDate(
    userExemptionProfile,
    today,
    userExemptionGrants,
  );
  const submittedCountForSummary = todayExemptionState.isExempt && todayExemptionState.category !== "leave"
    ? displayAccounts.length
    : submittedAccountIds.size;
  const pendingCountForSummary = todayExemptionState.isExempt
    ? 0
    : Math.max(displayAccounts.length - submittedAccountIds.size, 0);

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
    userExemptionProfile,
    userExemptionGrants,
    summary: {
      totalAccounts: displayAccounts.length,
      submittedCount: submittedCountForSummary,
      pendingCount: pendingCountForSummary,
      historyCount: (history ?? []).length,
    },
  };
}
