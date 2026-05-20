import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";
import type { Profile, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type LoaderSupabase = SupabaseClient;

type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
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
  const perm = await getUserPermissions();
  const scope = perm ? await buildDataAccessScope(createAdminClient(), perm.userId) : null;
  const [{ data: videos }, { data: profiles }, { data: accounts }, { data: tagIds }] = await Promise.all([
    supabase
      .from("videos")
      .select("*, accounts!inner(name, profile_id), profiles!inner(name)")
      .order("published_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name, profile_id").order("name", { ascending: true }),
    supabase.from("video_tags").select("video_id"),
  ]);

  const normalizedVideos = scope
    ? filterRowsByDataScope(scope, (videos ?? []) as VideoRow[], (video) => video.accounts?.profile_id ?? video.user_id)
    : ((videos ?? []) as VideoRow[]);
  const visibleProfileIds = new Set(scope?.visibleUserIds ?? normalizedVideos.map((video) => video.accounts?.profile_id ?? video.user_id));
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
    profiles: (profiles ?? [])
      .filter((profile) => visibleProfileIds.has(profile.id))
      .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? [])
      .filter((account) => visibleProfileIds.has(account.profile_id))
      .map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
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
