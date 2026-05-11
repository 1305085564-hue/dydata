import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import type { AnalyticsWorkbench } from "@/app/(app)/admin/analytics/analytics-workbench";
import { getPresetRange } from "@/lib/analytics-access";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

type AnalyticsSupabase = Awaited<ReturnType<typeof createClient>>;

type TeamProfile = { id: string; name: string; team_id: string | null };

type ReportRow = Parameters<typeof AnalyticsWorkbench>[0]["filteredReports"][number] & {
  user_id: string;
  account_id?: string | null;
  accounts?: { id: string; name: string; profile_id: string | null } | null;
};

type AccountJoin = { id: string; name: string; profile_id: string | null };

function normalizeJoinedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getReportOwnerId(report: ReportRow) {
  return report.accounts?.profile_id ?? report.user_id;
}

function getVideoOwnerId(video: { user_id: string; accounts?: { profile_id?: string | null } | null }) {
  return video.accounts?.profile_id ?? video.user_id;
}

export interface AnalyticsPageData {
  range: ReturnType<typeof getPresetRange>;
  userId: string;
  role: string;
  isPrivilegedUser: boolean;
  currentUserName: string;
  submitters: string[];
  filteredReports: Parameters<typeof AnalyticsWorkbench>[0]["filteredReports"];
  filteredVideos: Parameters<typeof AnalyticsWorkbench>[0]["filteredVideos"];
  filteredSnapshots: Parameters<typeof AnalyticsWorkbench>[0]["filteredSnapshots"];
  filteredVideoTags: Parameters<typeof AnalyticsWorkbench>[0]["filteredVideoTags"];
}

export async function loadAnalyticsPageData({
  supabase,
  userId,
  preset,
  from,
  to,
  includeVideoDetails = true,
}: {
  supabase: AnalyticsSupabase;
  userId: string;
  preset: AnalyticsRangePreset;
  from?: string;
  to?: string;
  includeVideoDetails?: boolean;
}): Promise<AnalyticsPageData> {
  const adminSupabase = createAdminClient();
  const range = getPresetRange(preset, new Date(), { from, to });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, permissions, team_id")
    .eq("id", userId)
    .single();
  const role = (profile?.role ?? "member") as UserRole;
  const currentUserName = profile?.name ?? "我";
  const currentUserTeamId = profile?.team_id ?? null;
  const scope = await buildDataAccessScope(adminSupabase, userId);
  const visibleUserIds = scope?.visibleUserIds ?? [userId];
  const isPrivilegedUser = (scope?.accessLevel ?? 1) > 1;

  let profilesQuery = adminSupabase.from("profiles").select("id, name, team_id").order("name");
  if (scope?.kind !== "all") {
    profilesQuery = profilesQuery.in("id", visibleUserIds);
  }

  const { data: teamProfileRows } = await profilesQuery;
  const teamProfiles: TeamProfile[] = (teamProfileRows ?? [{ id: userId, name: currentUserName, team_id: currentUserTeamId }]).map((item) => ({
    id: item.id,
    name: item.name,
    team_id: item.team_id ?? null,
  }));

  const teamUserIds = teamProfiles.map((item) => item.id);
  const teamUserIdSet = new Set(teamUserIds);
  const submitters = isPrivilegedUser ? teamProfiles.map((item) => item.name) : [currentUserName];

  const reportsQuery = adminSupabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, accounts(id, name, profile_id)",
    )
    .gte("report_date", range.from)
    .lte("report_date", range.to)
    .order("report_date", { ascending: false });

  const videosQuery = includeVideoDetails
    ? adminSupabase
        .from("videos")
        .select("*, accounts(name, profile_id)")
        .gte("published_at", `${range.from}T00:00:00+08:00`)
        .lte("published_at", `${range.to}T23:59:59+08:00`)
        .order("published_at", { ascending: false })
        .then((result) => {
          const nameMap = new Map(teamProfiles.map((teamProfile) => [teamProfile.id, teamProfile.name]));
          return {
            ...result,
            data: (result.data ?? []).map((video) => {
              const account = normalizeJoinedOne(video.accounts as AccountJoin | AccountJoin[] | null);
              return {
                ...video,
                accounts: account ? { name: account.name, profile_id: account.profile_id } : null,
                profiles: { name: nameMap.get(getVideoOwnerId({ ...video, accounts: account })) ?? nameMap.get(video.user_id) ?? "未知" },
              };
            }),
          };
        })
    : null;

  const [{ data: reports }, videosResult] = includeVideoDetails ? await Promise.all([reportsQuery, videosQuery]) : [await reportsQuery, null];

  const normalizedReports = ((reports ?? []) as unknown as Array<Omit<ReportRow, "accounts"> & { accounts?: AccountJoin | AccountJoin[] | null }>).map((report) => ({
    ...report,
    accounts: normalizeJoinedOne(report.accounts),
  }));
  const filteredReports = normalizedReports.filter((report) => teamUserIdSet.has(getReportOwnerId(report)));

  if (!includeVideoDetails) {
    return {
      range,
      userId,
      role,
      isPrivilegedUser,
      currentUserName,
      submitters,
      filteredReports,
      filteredVideos: [],
      filteredSnapshots: [],
      filteredVideoTags: [],
    };
  }

  const videos = videosResult?.data ?? [];
  const filteredVideos = (videos ?? []).filter((video) => teamUserIdSet.has(getVideoOwnerId(video)));
  const filteredVideoIds = filteredVideos.map((video) => video.id);
  const [{ data: snapshots }, { data: videoTags }] =
    filteredVideoIds.length > 0
      ? await Promise.all([
          adminSupabase.from("video_metrics_snapshots").select("*").in("video_id", filteredVideoIds),
          adminSupabase.from("video_tags").select("*").in("video_id", filteredVideoIds),
        ])
      : [{ data: [] }, { data: [] }];
  const filteredSnapshots = snapshots ?? [];
  const filteredVideoTags = videoTags ?? [];

  return {
    range,
    userId,
    role,
    isPrivilegedUser,
    currentUserName,
    submitters,
    filteredReports,
    filteredVideos,
    filteredSnapshots,
    filteredVideoTags,
  };
}
