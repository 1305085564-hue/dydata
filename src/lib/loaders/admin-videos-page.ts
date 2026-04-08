import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type LoaderSupabase = SupabaseClient<any, "public", any>;

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
  };
}

export async function loadAdminVideosPageData({ supabase }: { supabase: LoaderSupabase }): Promise<AdminVideosPageData> {
  const [{ data: videos }, { data: snapshots }, { data: profiles }, { data: accounts }, { data: videoTags }] = await Promise.all([
    supabase
      .from("videos")
      .select("*, accounts!inner(name), profiles!inner(name)")
      .order("published_at", { ascending: false }),
    supabase.from("video_metrics_snapshots").select("*"),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name").order("name", { ascending: true }),
    supabase.from("video_tags").select("*"),
  ]);

  const normalizedVideos = (videos ?? []) as VideoRow[];
  const normalizedTags = (videoTags ?? []) as VideoTag[];

  return {
    videos: normalizedVideos,
    snapshots: (snapshots ?? []) as VideoMetricsSnapshot[],
    profiles: (profiles ?? []).map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? []).map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    videoTags: normalizedTags,
    summary: {
      totalVideos: normalizedVideos.length,
      taggedVideos: new Set(normalizedTags.map((tag) => tag.video_id)).size,
      snapshotCount: (snapshots ?? []).filter((snapshot) => snapshot.snapshot_type === "24h").length,
      abnormalCount: normalizedVideos.filter((video) => video.anomaly_status !== "正常").length,
    },
  };
}
