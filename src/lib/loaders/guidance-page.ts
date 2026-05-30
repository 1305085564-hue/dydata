import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountTargetMode } from "@/types";
import { shiftDateOnly } from "./shared";

type LoaderSupabase = Pick<SupabaseClient, "from">;

type GuidanceAccountRow = {
  id: string;
  profile_id: string;
  name: string | null;
  content_direction: string | null;
  presentation_format: string | null;
  target_mode: AccountTargetMode | null;
  created_at: string | null;
};

type GuidanceProfileRow = {
  id: string;
  name: string | null;
};

type GuidanceReportRow = {
  user_id: string;
  account_id: string | null;
  report_date: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  completion_rate: string | null;
  completion_rate_5s: string | null;
  bounce_rate_2s: string | null;
};

export interface GuidancePageData {
  accounts: Array<{
    id: string;
    profileId: string;
    accountName: string;
    ownerName: string;
    contentDirection: string | null;
    presentationFormat: string | null;
    targetMode: AccountTargetMode | null;
    createdAt: string | null;
  }>;
  reports: Array<{
    userId: string;
    accountId: string;
    reportDate: string;
    playCount: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    followerGain: number | null;
    followerConvert: number | null;
    completionRate: string | null;
    completionRate5s: string | null;
    bounceRate2s: string | null;
  }>;
}

const GUIDANCE_REPORT_WINDOW_DAYS = 14;
const GUIDANCE_REPORT_SELECT =
  "user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, follower_convert, completion_rate, completion_rate_5s, bounce_rate_2s";

function extractActiveAccountIds(reports: Array<{ account_id: string | null }>) {
  return Array.from(
    new Set(
      reports
        .map((report) => report.account_id)
        .filter((accountId): accountId is string => Boolean(accountId)),
    ),
  );
}

function normalizeGuidanceAccounts(
  accounts: GuidanceAccountRow[],
  profileNameMap: Map<string, string | null>,
) {
  return accounts.map((account) => ({
    id: account.id,
    profileId: account.profile_id,
    accountName: account.name ?? "未命名账号",
    ownerName: profileNameMap.get(account.profile_id) ?? "未命名成员",
    contentDirection: account.content_direction,
    presentationFormat: account.presentation_format,
    targetMode: account.target_mode,
    createdAt: account.created_at,
  }));
}

function normalizeGuidanceReports(reports: GuidanceReportRow[]) {
  return reports.flatMap((report) => {
    if (!report.account_id) return [];
    return {
      userId: report.user_id,
      accountId: report.account_id,
      reportDate: report.report_date,
      playCount: report.play_count,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
      followerGain: report.follower_gain,
      followerConvert: report.follower_convert,
      completionRate: report.completion_rate,
      completionRate5s: report.completion_rate_5s,
      bounceRate2s: report.bounce_rate_2s,
    };
  });
}

export async function loadGuidancePageData({ supabase }: { supabase: LoaderSupabase }): Promise<GuidancePageData> {
  const windowStart = shiftDateOnly(new Date(), -(GUIDANCE_REPORT_WINDOW_DAYS - 1));

  const { data: reports } = await supabase
    .from("daily_reports")
    .select(GUIDANCE_REPORT_SELECT)
    .gte("report_date", windowStart)
    .not("account_id", "is", null);

  const normalizedReports = normalizeGuidanceReports((reports ?? []) as GuidanceReportRow[]);
  const activeAccountIds = extractActiveAccountIds((reports ?? []) as GuidanceReportRow[]);

  if (activeAccountIds.length === 0) {
    return {
      accounts: [],
      reports: [],
    };
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, profile_id, name, content_direction, presentation_format, target_mode, created_at")
    .in("id", activeAccountIds)
    .order("created_at", { ascending: true });

  const activeProfileIds = Array.from(
    new Set(
      ((accounts ?? []) as GuidanceAccountRow[])
        .map((account) => account.profile_id)
        .filter((profileId): profileId is string => Boolean(profileId)),
    ),
  );

  const { data: profiles } = activeProfileIds.length > 0
    ? await supabase.from("profiles").select("id, name").in("id", activeProfileIds)
    : { data: [] };

  const profileNameMap = new Map(
    ((profiles ?? []) as GuidanceProfileRow[]).map((profile) => [profile.id, profile.name]),
  );

  return {
    accounts: normalizeGuidanceAccounts((accounts ?? []) as GuidanceAccountRow[], profileNameMap),
    reports: normalizedReports,
  };
}

export const __internal = {
  GUIDANCE_REPORT_WINDOW_DAYS,
  GUIDANCE_REPORT_SELECT,
  extractActiveAccountIds,
  normalizeGuidanceAccounts,
};
