import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { buildContentFeedbackCardView, CONTENT_FEEDBACK_CARD_SELECT } from "@/lib/content-feedback-cards";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { ContentFeedbackCard, ContentFeedbackCardView, ContentReviewReadiness, Profile, Video, VideoMetricsSnapshot } from "@/types";

type LoaderSupabase = SupabaseClient;
type ScopeInput = Awaited<ReturnType<typeof buildDataAccessScope>>;

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
type PreviousVideoCandidateRow = Pick<Video, "id" | "account_id" | "published_at">;
type PreviousSnapshotRow = Pick<VideoMetricsSnapshot, "video_id" | "play_count" | "captured_at">;

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares, favorites, screenshot_urls, curve_screenshot_url, retention_screenshot_url";

const PREVIOUS_VIDEO_SELECT = "id, account_id, published_at";
const PREVIOUS_SNAPSHOT_SELECT = "video_id, play_count, captured_at";
const ADMIN_CONTENT_FIRST_SCREEN_RPC = "admin_content_first_screen";

export const ADMIN_CONTENT_INITIAL_LIMIT = 20;
const ADMIN_CONTENT_INITIAL_CANDIDATE_LIMIT = 60;
const FULL_QUERY_BATCH_SIZE = 200;

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

async function selectInBatches<Row>(
  ids: string[],
  run: (batch: string[]) => Promise<{ data: unknown[] | null }>,
) {
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += FULL_QUERY_BATCH_SIZE) {
    const batch = ids.slice(index, index + FULL_QUERY_BATCH_SIZE);
    if (batch.length === 0) continue;
    const { data } = await run(batch);
    if (data?.length) {
      rows.push(...(data as Row[]));
    }
  }
  return rows;
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

function buildLatestPlayCountByVideoId(snapshots: PreviousSnapshotRow[]) {
  const playCountByVideoId = new Map<string, number | null>();
  const capturedAtByVideoId = new Map<string, number>();

  for (const snapshot of snapshots) {
    const capturedAt = snapshot.captured_at ? new Date(snapshot.captured_at).getTime() : 0;
    const existingCapturedAt = capturedAtByVideoId.get(snapshot.video_id);
    if (existingCapturedAt !== undefined && existingCapturedAt >= capturedAt) continue;

    capturedAtByVideoId.set(snapshot.video_id, capturedAt);
    playCountByVideoId.set(snapshot.video_id, snapshot.play_count ?? null);
  }

  return playCountByVideoId;
}

function findPreviousVideoByVisibleId(visibleVideos: VideoRow[], candidates: PreviousVideoCandidateRow[]) {
  const candidatesByAccountId = new Map<string, PreviousVideoCandidateRow[]>();

  for (const candidate of candidates) {
    if (!candidate.account_id || !candidate.published_at) continue;
    const rows = candidatesByAccountId.get(candidate.account_id) ?? [];
    rows.push(candidate);
    candidatesByAccountId.set(candidate.account_id, rows);
  }

  for (const rows of candidatesByAccountId.values()) {
    rows.sort((left, right) => new Date(right.published_at!).getTime() - new Date(left.published_at!).getTime());
  }

  const previousByVideoId = new Map<string, PreviousVideoCandidateRow>();
  for (const video of visibleVideos) {
    if (!video.account_id || !video.published_at) continue;
    const currentPublishedAt = new Date(video.published_at).getTime();
    const previousVideo = candidatesByAccountId
      .get(video.account_id)
      ?.find((candidate) => candidate.id !== video.id && new Date(candidate.published_at!).getTime() < currentPublishedAt);

    if (previousVideo) {
      previousByVideoId.set(video.id, previousVideo);
    }
  }

  return previousByVideoId;
}

function attachPlayChangeSignals({
  videos,
  currentSnapshots,
  previousVideos,
  previousSnapshots,
}: {
  videos: VideoRow[];
  currentSnapshots: PreviousSnapshotRow[];
  previousVideos: PreviousVideoCandidateRow[];
  previousSnapshots: PreviousSnapshotRow[];
}) {
  const currentPlayCountByVideoId = buildLatestPlayCountByVideoId(currentSnapshots);
  const previousPlayCountByVideoId = buildLatestPlayCountByVideoId(previousSnapshots);
  const previousVideoByVisibleId = findPreviousVideoByVisibleId(videos, previousVideos);

  return videos.map((video) => {
    const previousVideo = previousVideoByVisibleId.get(video.id);
    const currentPlayCount = currentPlayCountByVideoId.get(video.id);
    const previousPlayCount = previousVideo ? previousPlayCountByVideoId.get(previousVideo.id) : null;

    if (currentPlayCount == null || previousPlayCount == null || previousPlayCount <= 0) {
      return {
        ...video,
        previous_play_count: previousPlayCount ?? null,
        play_count_change_pct: null,
        play_change_signal: null,
      };
    }

    const playCountChangePct = ((currentPlayCount - previousPlayCount) / previousPlayCount) * 100;
    const playChangeSignal: Video["play_change_signal"] =
      playCountChangePct >= 100 ? "surge"
        : playCountChangePct <= -50 ? "halve"
          : null;

    return {
      ...video,
      previous_play_count: previousPlayCount,
      play_count_change_pct: playCountChangePct,
      play_change_signal: playChangeSignal,
    };
  });
}

async function loadPlayChangeSignals({
  supabase,
  videos,
  previousCandidateVideos,
  currentSnapshots,
}: {
  supabase: LoaderSupabase;
  videos: VideoRow[];
  previousCandidateVideos: VideoRow[];
  currentSnapshots: PreviousSnapshotRow[];
}) {
  const publishedVideos = previousCandidateVideos.filter((video) => video.account_id && video.published_at);
  const visibleAccountIds = new Set(videos.map((video) => video.account_id).filter(Boolean));
  const relevantCandidateVideos = publishedVideos.filter((video) => visibleAccountIds.has(video.account_id));
  if (relevantCandidateVideos.length === 0) {
    return attachPlayChangeSignals({
      videos,
      currentSnapshots,
      previousVideos: [],
      previousSnapshots: [],
    });
  }

  const videosByAccountId = new Map<string, VideoRow[]>();
  for (const video of relevantCandidateVideos) {
    const rows = videosByAccountId.get(video.account_id) ?? [];
    rows.push(video);
    videosByAccountId.set(video.account_id, rows);
  }

  const previousVideoResults = await Promise.all(
    Array.from(videosByAccountId.entries()).map(([accountId, accountVideos]) => {
      const oldestKnownPublishedAt = accountVideos.reduce((oldest, video) => {
        const publishedAt = new Date(video.published_at!).getTime();
        return Math.min(oldest, publishedAt);
      }, Number.POSITIVE_INFINITY);

      return supabase
        .from("videos")
        .select(PREVIOUS_VIDEO_SELECT)
        .eq("account_id", accountId)
        .lt("published_at", new Date(oldestKnownPublishedAt).toISOString())
        .order("published_at", { ascending: false })
        .limit(1);
    }),
  );

  const previousBoundaryVideos = previousVideoResults.flatMap((result) => (result.data ?? []) as PreviousVideoCandidateRow[]);
  const previousCandidates = [...relevantCandidateVideos, ...previousBoundaryVideos];
  const previousVideoByVisibleId = findPreviousVideoByVisibleId(videos, previousCandidates);
  const previousVideoIds = Array.from(
    new Set(Array.from(previousVideoByVisibleId.values()).map((video) => video.id)),
  );
  const { data: previousSnapshots } = previousVideoIds.length > 0
    ? {
        data: await selectInBatches<PreviousSnapshotRow>(previousVideoIds, (batch) =>
          Promise.resolve(supabase
            .from("video_metrics_snapshots")
            .select(PREVIOUS_SNAPSHOT_SELECT)
            .eq("snapshot_type", "24h")
            .in("video_id", batch)
            .order("captured_at", { ascending: false })),
        ),
      }
    : { data: [] };

  return attachPlayChangeSignals({
    videos,
    currentSnapshots,
    previousVideos: previousCandidates,
    previousSnapshots: (previousSnapshots ?? []) as PreviousSnapshotRow[],
  });
}

export async function loadAdminContentPageData({
  supabase,
  view = "pending",
  perspective = "company",
  teamId = null,
  mode = "full",
  permissionInfo,
  scope,
}: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  mode?: LoadMode;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}): Promise<AdminContentPageData> {
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const resolvedScope = scope
    ?? (permissionInfo
      ? await buildDataAccessScope(createAdminClient(), permissionInfo.userId, {
          perspective,
          teamId,
          profile: {
            id: permissionInfo.userId,
            role: permissionInfo.role,
            permissions: permissionInfo.permissions,
            access_level: permissionInfo.accessLevel,
            team_id: permissionInfo.teamId,
            group_id: permissionInfo.groupId,
            led_group_ids: permissionInfo.ledGroupIds,
            business_role: permissionInfo.businessRole,
          },
        })
      : null);

  let videosQuery = supabase
    .from("videos")
    .select(CONTENT_VIDEO_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (mode === "initial") {
    videosQuery = videosQuery.range(0, ADMIN_CONTENT_INITIAL_CANDIDATE_LIMIT - 1);
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
  const videos = resolvedScope
    ? filterRowsByDataScope(resolvedScope, allVideos, (video) => video.accounts?.profile_id ?? video.user_id)
    : allVideos;
  const scopedVideoIds = videos.map((video) => video.id);
  const scopedVideoIdSet = new Set(scopedVideoIds);
  const visibleProfileIds = new Set(resolvedScope?.visibleUserIds ?? videos.map((video) => video.accounts?.profile_id ?? video.user_id));

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
  const shouldReuseFeedbackRowsForSummary = mode === "initial";
  const [snapshots, segmentRows, feedbackCardRows, feedbackCardStatusRows, snapshotFlagRows] = await Promise.all([
    visibleVideoIds.length > 0
      ? selectInBatches<VideoMetricsSnapshot>(visibleVideoIds, (batch) =>
          Promise.resolve(supabase
            .from("video_metrics_snapshots")
            .select(CONTENT_SNAPSHOT_SELECT)
            .eq("snapshot_type", "24h")
            .in("video_id", batch)
            .order("captured_at", { ascending: false })),
        )
      : Promise.resolve([]),
    visibleVideoIds.length > 0
      ? selectInBatches<SegmentRow>(visibleVideoIds, (batch) =>
          Promise.resolve(supabase.from("video_content_segments").select("video_id").in("video_id", batch)),
        )
      : Promise.resolve([]),
    visibleVideoIds.length > 0
      ? selectInBatches<ContentFeedbackCard>(visibleVideoIds, (batch) =>
          Promise.resolve(serviceClient
            .from("content_feedback_cards")
            .select(CONTENT_FEEDBACK_CARD_SELECT)
            .in("video_id", batch)),
        )
      : Promise.resolve([]),
    shouldReuseFeedbackRowsForSummary
      ? Promise.resolve([])
      : summaryVideoIds.length > 0
      ? selectInBatches<FeedbackCardStatusRow>(summaryVideoIds, (batch) =>
          Promise.resolve(serviceClient
            .from("content_feedback_cards")
            .select("video_id, card_status")
            .in("video_id", batch)),
        )
      : Promise.resolve([]),
    mode === "full" && scopedVideoIds.length > 0
      ? selectInBatches<SnapshotVideoIdRow>(scopedVideoIds, (batch) =>
          Promise.resolve(supabase
            .from("video_metrics_snapshots")
            .select("video_id")
            .eq("snapshot_type", "24h")
            .in("video_id", batch)),
        )
      : Promise.resolve([]),
  ]);
  const initialVisibleVideosWithSignals = await loadPlayChangeSignals({
    supabase,
    videos: initialVisibleVideos,
    previousCandidateVideos: videos,
    currentSnapshots: snapshots as PreviousSnapshotRow[],
  });
  const snapshotVideoIds = new Set(snapshots.map((snapshot) => snapshot.video_id as string));
  const snapshotSummaryVideoIds = mode === "initial"
    ? snapshotVideoIds
    : new Set(snapshotFlagRows.map((row) => row.video_id));
  const segmentedVideoIds = new Set(segmentRows.map((row) => row.video_id));
  const feedbackCardMap = new Map<string, ContentFeedbackCard>();
  for (const row of feedbackCardRows) {
    feedbackCardMap.set(row.video_id, row);
  }
  const feedbackCards = Object.fromEntries(
    initialVisibleVideosWithSignals.map((video) => [video.id, buildContentFeedbackCardView(video.id, feedbackCardMap.get(video.id) ?? null)]),
  ) as Record<string, ContentFeedbackCardView>;
  const reviewReadiness = Object.fromEntries(
    initialVisibleVideosWithSignals.map((video) => [
      video.id,
      buildContentReviewReadiness({
        video,
        feedbackCard: feedbackCards[video.id],
        hasSnapshot24h: snapshotVideoIds.has(video.id),
        hasSegments: segmentedVideoIds.has(video.id),
      }),
    ]),
  ) as Record<string, ContentReviewReadiness>;
  const workflowSummary = buildWorkflowSummary(
    videos,
    shouldReuseFeedbackRowsForSummary
      ? feedbackCardRows.map((row) => ({
          video_id: row.video_id,
          card_status: row.card_status,
        }))
      : feedbackCardStatusRows,
  );

  return {
    videos: initialVisibleVideosWithSignals,
    snapshots,
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

export async function loadAdminContentInitialData(args: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}) {
  if (!args.scope) {
    return loadAdminContentPageData({
      ...args,
      mode: "initial",
    });
  }

  const { data, error } = await args.supabase.rpc(ADMIN_CONTENT_FIRST_SCREEN_RPC, {
    p_visible_user_ids: args.scope.visibleUserIds,
    p_view: args.view ?? "pending",
    p_limit_rows: ADMIN_CONTENT_INITIAL_LIMIT,
    p_candidate_limit: ADMIN_CONTENT_INITIAL_CANDIDATE_LIMIT,
  });

  if (error || !data || typeof data !== "object") {
    return loadAdminContentPageData({
      ...args,
      mode: "initial",
    });
  }

  return data as AdminContentPageData;
}

export async function loadAdminContentFullData(args: {
  supabase: LoaderSupabase;
  view?: "pending" | "all";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}) {
  return loadAdminContentPageData({
    ...args,
    mode: "full",
  });
}

export const __internal = {
  ADMIN_CONTENT_INITIAL_CANDIDATE_LIMIT,
  ADMIN_CONTENT_FIRST_SCREEN_RPC,
  CONTENT_VIDEO_SELECT,
  CONTENT_SNAPSHOT_SELECT,
  buildWorkflowSummary,
  attachPlayChangeSignals,
  findPreviousVideoByVisibleId,
  limitInitialVideos,
  normalizeVideoRows,
};
