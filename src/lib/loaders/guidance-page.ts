import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountTargetMode } from "@/types";
import { shiftDateOnly } from "./shared";

type LoaderSupabase = Pick<SupabaseClient, "from">;

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
    avgPlayDuration: string | null;
    bounceRate2s: string | null;
  }>;
  summary: {
    accountCount: number;
    ownerCount: number;
    reportCount: number;
    monthAgo: string;
  };
}

export async function loadGuidancePageData({ supabase }: { supabase: LoaderSupabase }): Promise<GuidancePageData> {
  const monthAgo = shiftDateOnly(new Date(), -30);

  const [{ data: profiles }, { data: accounts }, { data: reports }] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format, target_mode, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_reports")
      .select(
        "user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, follower_convert, completion_rate, completion_rate_5s, avg_play_duration, bounce_rate_2s",
      )
      .gte("report_date", monthAgo)
      .not("account_id", "is", null),
  ]);

  const profileNameMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));

  const normalizedAccounts = (accounts ?? []).map((account) => ({
    id: account.id,
    profileId: account.profile_id,
    accountName: account.name ?? "未命名账号",
    ownerName: profileNameMap.get(account.profile_id) ?? "未命名成员",
    contentDirection: account.content_direction,
    presentationFormat: account.presentation_format,
    targetMode: account.target_mode,
    createdAt: account.created_at,
  }));

  const normalizedReports = (reports ?? []).flatMap((report) => {
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
      avgPlayDuration: report.avg_play_duration,
      bounceRate2s: report.bounce_rate_2s,
    };
  });

  return {
    accounts: normalizedAccounts,
    reports: normalizedReports,
    summary: {
      accountCount: normalizedAccounts.length,
      ownerCount: new Set(normalizedAccounts.map((account) => account.profileId)).size,
      reportCount: normalizedReports.length,
      monthAgo,
    },
  };
}
