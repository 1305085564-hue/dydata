import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import { buildAnalyticsAccessContext, getPresetRange, restrictPersonRows } from "@/lib/analytics-access";
import { createAdminClient } from "@/lib/supabase/admin";

type AnalyticsSupabase = SupabaseClient<any, "public", any>;

export interface AnalyticsPageData {
  range: ReturnType<typeof getPresetRange>;
  userId: string;
  role: string;
  isPrivilegedUser: boolean;
  currentUserName: string;
  submitters: string[];
  filteredReports: any[];
  filteredVideos: any[];
  filteredSnapshots: any[];
  filteredVideoTags: any[];
}

export async function loadAnalyticsPageData({
  supabase,
  userId,
  preset,
  from,
  to,
}: {
  supabase: AnalyticsSupabase;
  userId: string;
  preset: AnalyticsRangePreset;
  from?: string;
  to?: string;
}): Promise<AnalyticsPageData> {
  const adminSupabase = createAdminClient();
  const range = getPresetRange(preset, new Date(), { from, to });

  const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", userId).single();
  const role = profile?.role ?? "member";
  const currentUserName = profile?.name ?? "我";
  const isPrivilegedUser = role === "admin" || role === "owner";
  const access = buildAnalyticsAccessContext({
    userId,
    role,
    teamId: isPrivilegedUser ? "__all__" : null,
    demoTeamId: null,
  });

  const teamProfiles: { id: string; name: string }[] = isPrivilegedUser
    ? (await adminSupabase.from("profiles").select("id, name").order("name")).data ?? []
    : [{ id: userId, name: currentUserName }];

  const teamUserIds = teamProfiles.map((item) => item.id);
  const submitters = isPrivilegedUser ? teamProfiles.map((item) => item.name) : [currentUserName];
  const [{ data: reports }, { data: videos }, { data: snapshots }, { data: videoTags }] = await Promise.all([
    adminSupabase
      .from("daily_reports")
      .select(
        "id, user_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
      )
      .in("user_id", teamUserIds)
      .gte("report_date", range.from)
      .lte("report_date", range.to)
      .order("report_date", { ascending: false }),
    adminSupabase
      .from("videos")
      .select("*, accounts(name), cover_url")
      .in("user_id", teamUserIds)
      .order("published_at", { ascending: false })
      .then((result) => {
        const nameMap = new Map(teamProfiles.map((teamProfile) => [teamProfile.id, teamProfile.name]));
        return {
          ...result,
          data: (result.data ?? []).map((video) => ({
            ...video,
            profiles: { name: nameMap.get(video.user_id) ?? "未知" },
          })),
        };
      }),
    adminSupabase.from("video_metrics_snapshots").select("*"),
    adminSupabase.from("video_tags").select("*"),
  ]);

  const filteredReports = access.canViewAllMembers ? reports ?? [] : restrictPersonRows(reports ?? [], { role, currentUserName });
  const filteredVideos = (videos ?? []).filter((video) => (access.canViewAllMembers ? true : video.user_id === userId));
  const filteredSnapshots = (snapshots ?? []).filter((snapshot) => filteredVideos.some((video) => video.id === snapshot.video_id));
  const filteredVideoTags = (videoTags ?? []).filter((tag) => filteredVideos.some((video) => video.id === tag.video_id));

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
