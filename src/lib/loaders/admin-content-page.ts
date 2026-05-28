import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { buildContentFeedbackCardView, CONTENT_FEEDBACK_CARD_SELECT } from "@/lib/content-feedback-cards";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";
import type { ContentFeedbackCard, ContentFeedbackCardView, ContentReviewReadiness, Profile, Video, VideoMetricsSnapshot } from "@/types";

type LoaderSupabase = SupabaseClient;
type UserPermissionInfo = NonNullable<Awaited<ReturnType<typeof getUserPermissions>>>;

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
type LoadMode = "initial" | "full";
type FeedbackCardStatusRow = Pick<ContentFeedbackCard, "video_id" | "card_status">;
type SegmentRow = { video_id: string };
type SnapshotVideoIdRow = { video_id: string };

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares";

export const ADMIN_CONTENT_INITIAL_LIMIT = 30;

export interface AdminContentPageData {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  reviewedVideoIds: string[];
  feedbackCards: Record<string, ContentFeedbackCardView>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  summary: {
    totalVideos: number;
    reviewedCount: number;
    snapshotCount: number;
    pendingReviewCount: number;
  };
  workflowSummary: {
    notStarted: number;
    draft: number;
    confirmed: number;
    sent: number;
    viewed: number;
    pendingDelivery: number;
  };
  isPartial?: boolean;
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

function limitInitialVideos<T>(rows: T[], mode: LoadMode) {
  return mode === "initial" ? rows.slice(0, ADMIN_CONTENT_INITIAL_LIMIT) : rows;
}

function buildWorkflowSummary(videos: VideoRow[], cardStatusRows: FeedbackCardStatusRow[]) {
  const statusByVideoId = new Map(cardStatusRows.map((row) => [row.video_id, row.card_status]));
  const counts = {
    notStarted: 0,
    draft: 0,
    confirmed: 0,
    sent: 0,
    viewed: 0,
    pendingDelivery: 0,
  };

  for (const video of videos) {
    const status = statusByVideoId.get(video.id) ?? "not_started";
    if (status === "draft") {
      counts.draft += 1;
      counts.pendingDelivery += 1;
    } else if (status === "confirmed") {
      counts.confirmed += 1;
      counts.pendingDelivery += 1;
    } else if (status === "sent") {
      counts.sent += 1;
    } else if (status === "viewed") {
      counts.viewed += 1;
    } else {
      counts.notStarted += 1;
    }
  }

  return counts;
}

export async function loadAdminContentPageData({
  supabase,
  view = "pending",
  perspective = "company",
  teamId = null,
  mode = "full",
  permissionInfo,
}: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  mode?: LoadMode;
  permissionInfo?: UserPermissionInfo;
}): Promise<AdminContentPageData> {
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const perm = permissionInfo ?? await getUserPermissions();
  const scope = perm
    ? await buildDataAccessScope(createAdminClient(), perm.userId, { perspective, teamId })
    : null;

  let videosQuery = supabase
    .from("videos")
    .select(CONTENT_VIDEO_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (mode === "initial") {
    videosQuery = videosQuery.range(0, ADMIN_CONTENT_INITIAL_LIMIT - 1);
  }

  const [
    { data: videosRaw },
    { data: profiles },
    { data: accounts },
    { data: reviewedResults },
  ] = await Promise.all([
    videosQuery,
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name, profile_id").order("name", { ascending: true }),
    mode === "full"
      ? serviceClient
          .from("ai_insight_result")
          .select("result_json")
          .eq("insight_type", "next_day_review")
          .eq("result_status", "success")
      : Promise.resolve({ data: [] }),
  ]);

  const allVideos = normalizeVideoRows((videosRaw ?? []) as unknown as RawVideoRow[]).sort((left, right) => {
    const leftTs = left.published_at ? new Date(left.published_at).getTime() : new Date(left.created_at).getTime();
    const rightTs = right.published_at ? new Date(right.published_at).getTime() : new Date(right.created_at).getTime();
    return rightTs - leftTs;
  });
  const videos = scope
    ? filterRowsByDataScope(scope, allVideos, (video) => video.accounts?.profile_id ?? video.user_id)
    : allVideos;
  const scopedVideoIds = videos.map((video) => video.id);
  const scopedVideoIdSet = new Set(scopedVideoIds);
  const visibleProfileIds = new Set(scope?.visibleUserIds ?? videos.map((video) => video.accounts?.profile_id ?? video.user_id));

  const reviewedVideoIds = Array.from(
    new Set(
      (reviewedResults ?? [])
        .map((result) => {
          const json = result.result_json as Record<string, unknown> | null;
          return typeof json?.video_id === "string" ? json.video_id : null;
        })
        .filter((id): id is string => id !== null && scopedVideoIdSet.has(id)),
    ),
  );

  const reviewedVideoIdSet = new Set(reviewedVideoIds);
  const pendingVideos = videos.filter((video) => !reviewedVideoIdSet.has(video.id));
  const visibleVideos = view === "pending" ? pendingVideos : videos;
  const initialVisibleVideos = limitInitialVideos(visibleVideos, mode);
  const visibleVideoIds = initialVisibleVideos.map((video) => video.id);
  const summaryVideoIds = mode === "initial" ? visibleVideoIds : scopedVideoIds;
  const [
    { data: snapshots },
    { data: segmentRows },
    { data: feedbackCardRows },
    { data: feedbackCardStatusRows },
    { data: snapshotFlagRows },
  ] = await Promise.all([
    visibleVideoIds.length > 0
      ? supabase
          .from("video_metrics_snapshots")
          .select(CONTENT_SNAPSHOT_SELECT)
          .eq("snapshot_type", "24h")
          .in("video_id", visibleVideoIds)
          .order("captured_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    visibleVideoIds.length > 0
      ? supabase.from("video_content_segments").select("video_id").in("video_id", visibleVideoIds)
      : Promise.resolve({ data: [] }),
    visibleVideoIds.length > 0
      ? serviceClient
          .from("content_feedback_cards")
          .select(CONTENT_FEEDBACK_CARD_SELECT)
          .in("video_id", visibleVideoIds)
      : Promise.resolve({ data: [] }),
    summaryVideoIds.length > 0
      ? serviceClient
          .from("content_feedback_cards")
          .select("video_id, card_status")
          .in("video_id", summaryVideoIds)
      : Promise.resolve({ data: [] }),
    mode === "full" && scopedVideoIds.length > 0
      ? supabase
          .from("video_metrics_snapshots")
          .select("video_id")
          .eq("snapshot_type", "24h")
          .in("video_id", scopedVideoIds)
      : Promise.resolve({ data: [] }),
  ]);
  const snapshotVideoIds = new Set((snapshots ?? []).map((snapshot) => snapshot.video_id as string));
  const snapshotSummaryVideoIds = mode === "initial"
    ? snapshotVideoIds
    : new Set((snapshotFlagRows ?? []).map((row) => (row as SnapshotVideoIdRow).video_id));
  const segmentedVideoIds = new Set((segmentRows ?? []).map((row) => (row as SegmentRow).video_id));
  const feedbackCardMap = new Map<string, ContentFeedbackCard>();
  for (const row of (feedbackCardRows ?? []) as ContentFeedbackCard[]) {
    feedbackCardMap.set(row.video_id, row);
  }
  const feedbackCards = Object.fromEntries(
    initialVisibleVideos.map((video) => [video.id, buildContentFeedbackCardView(video.id, feedbackCardMap.get(video.id) ?? null)]),
  ) as Record<string, ContentFeedbackCardView>;
  const reviewReadiness = Object.fromEntries(
    initialVisibleVideos.map((video) => [
      video.id,
      buildContentReviewReadiness({
        video,
        feedbackCard: feedbackCards[video.id],
        hasSnapshot24h: snapshotVideoIds.has(video.id),
        hasSegments: segmentedVideoIds.has(video.id),
      }),
    ]),
  ) as Record<string, ContentReviewReadiness>;
  const workflowSummary = buildWorkflowSummary(videos, (feedbackCardStatusRows ?? []) as FeedbackCardStatusRow[]);

  return {
    videos: initialVisibleVideos,
    snapshots: (snapshots ?? []) as VideoMetricsSnapshot[],
    profiles: (profiles ?? [])
      .filter((profile) => visibleProfileIds.has(profile.id))
      .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? [])
      .filter((account) => visibleProfileIds.has(account.profile_id))
      .map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    reviewedVideoIds,
    feedbackCards,
    reviewReadiness,
    summary: {
      totalVideos: videos.length,
      reviewedCount: reviewedVideoIds.length,
      snapshotCount: snapshotSummaryVideoIds.size,
      pendingReviewCount: pendingVideos.length,
    },
    workflowSummary,
    isPartial: mode === "initial" && visibleVideos.length > initialVisibleVideos.length,
  };
}

export const __internal = {
  CONTENT_VIDEO_SELECT,
  CONTENT_SNAPSHOT_SELECT,
  buildWorkflowSummary,
  limitInitialVideos,
  normalizeVideoRows,
};
