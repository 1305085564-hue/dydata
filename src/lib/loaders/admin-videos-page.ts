import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type LoaderSupabase = SupabaseClient;

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface AdminVideosPageData {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  videoTags: VideoTag[];
  summary: {
    totalVideos: number;
    taggedVideos: number;
    snapshotCount: number;
    abnormalCount: number;
    pendingCount: number;
  };
}

export async function loadAdminVideosPageData({
  supabase,
  view = "pending",
}: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
}): Promise<AdminVideosPageData> {
  const [{ data: videos }, { data: profiles }, { data: accounts }, { data: tagIds }] = await Promise.all([
    supabase
      .from("videos")
      .select("*, accounts!inner(name), profiles!inner(name)")
      .order("published_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name").order("name", { ascending: true }),
    supabase.from("video_tags").select("video_id"),
  ]);

  const normalizedVideos = (videos ?? []) as VideoRow[];
  const taggedVideoIds = new Set((tagIds ?? []).map((tag) => tag.video_id as string));
  const pendingVideos = normalizedVideos.filter(
    (video) => !taggedVideoIds.has(video.id) || video.anomaly_status !== "正常",
  );
  const visibleVideos =
    view === "pending"
      ? pendingVideos
      : normalizedVideos;
  const visibleVideoIds = visibleVideos.map((video) => video.id);
  const [{ data: snapshots }, { data: videoTags }] =
    visibleVideoIds.length > 0
      ? await Promise.all([
          supabase.from("video_metrics_snapshots").select("*").in("video_id", visibleVideoIds),
          supabase.from("video_tags").select("*").in("video_id", visibleVideoIds),
        ])
      : [{ data: [] }, { data: [] }];
  const normalizedTags = (videoTags ?? []) as VideoTag[];

  return {
    videos: visibleVideos,
    snapshots: (snapshots ?? []) as VideoMetricsSnapshot[],
    profiles: (profiles ?? []).map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? []).map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    videoTags: normalizedTags,
    summary: {
      totalVideos: normalizedVideos.length,
      taggedVideos: taggedVideoIds.size,
      snapshotCount: (snapshots ?? []).filter((snapshot) => snapshot.snapshot_type === "24h").length,
      abnormalCount: normalizedVideos.filter((video) => video.anomaly_status !== "正常").length,
      pendingCount: pendingVideos.length,
    },
  };
}
