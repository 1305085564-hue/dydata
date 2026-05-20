import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";
import type { Profile, Video, VideoMetricsSnapshot } from "@/types";

type LoaderSupabase = SupabaseClient;

type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
  profiles: { name: string };
};

type RawVideoRow = Omit<VideoRow, "accounts" | "profiles"> & {
  accounts: { name: string | null; profile_id?: string | null } | Array<{ name: string | null; profile_id?: string | null }> | null;
  profiles: { name: string | null } | Array<{ name: string | null }> | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string; profile_id?: string | null };

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at, accounts!inner(name, profile_id), profiles!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares";

export interface AdminContentPageData {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  reviewedVideoIds: string[];
  summary: {
    totalVideos: number;
    reviewedCount: number;
    snapshotCount: number;
    pendingReviewCount: number;
  };
}

function readJoinedName(value: RawVideoRow["accounts"] | RawVideoRow["profiles"], fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? fallback;
}

function normalizeVideoRows(rows: RawVideoRow[]): VideoRow[] {
  return rows.map((row) => ({
    ...row,
    accounts: { name: readJoinedName(row.accounts, "未命名账号") },
    profiles: { name: readJoinedName(row.profiles, "未命名成员") },
  }));
}

export async function loadAdminContentPageData({
  supabase,
  view = "pending",
}: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
}): Promise<AdminContentPageData> {
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const perm = await getUserPermissions();
  const scope = perm ? await buildDataAccessScope(createAdminClient(), perm.userId) : null;

  const [
    { data: videosRaw },
    { data: profiles },
    { data: accounts },
    { data: reviewedResults },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select(CONTENT_VIDEO_SELECT)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name, profile_id").order("name", { ascending: true }),
    serviceClient
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success"),
  ]);

  const allVideos = normalizeVideoRows((videosRaw ?? []) as unknown as RawVideoRow[]).sort((left, right) => {
    const leftTs = left.published_at ? new Date(left.published_at).getTime() : new Date(left.created_at).getTime();
    const rightTs = right.published_at ? new Date(right.published_at).getTime() : new Date(right.created_at).getTime();
    return rightTs - leftTs;
  });
  const videos = scope
    ? filterRowsByDataScope(scope, allVideos, (video) => video.accounts?.profile_id ?? video.user_id)
    : allVideos;
  const visibleProfileIds = new Set(scope?.visibleUserIds ?? videos.map((video) => video.accounts?.profile_id ?? video.user_id));

  const reviewedVideoIds = Array.from(
    new Set(
      (reviewedResults ?? [])
        .map((result) => {
          const json = result.result_json as Record<string, unknown> | null;
          return typeof json?.video_id === "string" ? json.video_id : null;
        })
        .filter((id): id is string => id !== null),
    ),
  );

  const reviewedVideoIdSet = new Set(reviewedVideoIds);
  const pendingVideos = videos.filter((video) => !reviewedVideoIdSet.has(video.id));
  const visibleVideos = view === "pending" ? pendingVideos : videos;
  const visibleVideoIds = visibleVideos.map((video) => video.id);
  const { data: snapshots } =
    visibleVideoIds.length > 0
      ? await supabase
          .from("video_metrics_snapshots")
          .select(CONTENT_SNAPSHOT_SELECT)
          .eq("snapshot_type", "24h")
          .in("video_id", visibleVideoIds)
          .order("captured_at", { ascending: false })
      : { data: [] };
  const snapshotCount = (snapshots ?? []).length;

  return {
    videos: visibleVideos,
    snapshots: (snapshots ?? []) as VideoMetricsSnapshot[],
    profiles: (profiles ?? [])
      .filter((profile) => visibleProfileIds.has(profile.id))
      .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? [])
      .filter((account) => visibleProfileIds.has(account.profile_id))
      .map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    reviewedVideoIds,
    summary: {
      totalVideos: videos.length,
      reviewedCount: reviewedVideoIds.length,
      snapshotCount,
      pendingReviewCount: pendingVideos.length,
    },
  };
}

export const __internal = {
  CONTENT_VIDEO_SELECT,
  CONTENT_SNAPSHOT_SELECT,
  normalizeVideoRows,
};
