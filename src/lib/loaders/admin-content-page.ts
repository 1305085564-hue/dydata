import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseQuerySucceeded, fetchAllQueryPages } from "@/lib/supabase/query-error";
import { buildLatestVideoSnapshotMap } from "@/lib/video-snapshot-map";
import { classifyVideoTopicKind, type VideoTopicKind } from "@/lib/topics/library";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { ContentReviewReadiness, Profile, Video, VideoMetricsSnapshot } from "@/types";

type LoaderSupabase = SupabaseClient;
type ScopeInput = Awaited<ReturnType<typeof buildDataAccessScope>>;
type ProfileOptionScope = {
  visibleUserIds: string[];
  activeVisibleUserIds?: string[];
};

type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
  profiles: { name: string };
};

type RawVideoRow = Omit<VideoRow, "accounts" | "profiles"> & {
  accounts: { name: string | null; profile_id?: string | null } | Array<{ name: string | null; profile_id?: string | null }> | null;
  profiles: { name: string | null } | Array<{ name: string | null }> | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type SegmentRow = { video_id: string };
type PreviousVideoCandidateRow = Pick<Video, "id" | "account_id" | "published_at">;
type PreviousSnapshotRow = Pick<VideoMetricsSnapshot, "video_id" | "play_count" | "captured_at">;

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, review_status, reviewed_at, lifecycle_state, trashed_at, trashed_by, purged_at, purged_by, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url";

const PREVIOUS_VIDEO_SELECT = "id, account_id, published_at";
const PREVIOUS_SNAPSHOT_SELECT = "video_id, play_count, captured_at";

const FULL_QUERY_BATCH_SIZE = 200;
const ADMIN_CONTENT_LIST_CACHE_TTL_MS = 60_000;
/** 单请求内并发查询上限：批次查询与按账号边界查询共用，避免上千条视频时打满连接池 */
const QUERY_CONCURRENCY_LIMIT = 6;
const PLAY_CHANGE_SURGE_DELTA_MIN = 5_000;
const PLAY_CHANGE_HALVE_CURRENT_FLOOR = 5_000;

export interface AdminContentPageData {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  reviewReadiness: Record<string, ContentReviewReadiness>;
  summary: {
    totalVideos: number;
  };
}

export interface AdminContentVideoDetail {
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind: VideoTopicKind;
}

function readJoinedName(value: RawVideoRow["accounts"] | RawVideoRow["profiles"], fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? fallback;
}

function readJoinedAccount(value: RawVideoRow["accounts"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return {
    name: row?.name ?? "未命名账号",
    profile_id: row?.profile_id ?? null,
  };
}

function normalizeVideoRows(rows: RawVideoRow[]): VideoRow[] {
  return rows.map((row) => ({
    ...row,
    accounts: readJoinedAccount(row.accounts),
    profiles: { name: readJoinedName(row.profiles, "未命名成员") },
  }));
}

function buildScopedProfileOptions(
  profiles: FilterOption[],
  scope: ProfileOptionScope | null,
  fallbackProfileIds: string[] = [],
) {
  const allowedProfileIds = new Set(
    scope
      ? (scope.activeVisibleUserIds ?? scope.visibleUserIds)
      : fallbackProfileIds,
  );
  if (allowedProfileIds.size === 0) return [];

  return profiles
    .filter((profile) => allowedProfileIds.has(profile.id))
    .map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" }));
}

function buildReviewReadinessMap({
  videos,
  snapshotVideoIds,
  segmentedVideoIds,
}: {
  videos: VideoRow[];
  snapshotVideoIds: Set<string>;
  segmentedVideoIds: Set<string>;
}) {
  return Object.fromEntries(
    videos.map((video) => [
      video.id,
      buildContentReviewReadiness({
        video,
        hasSnapshot24h: snapshotVideoIds.has(video.id),
        hasSegments: segmentedVideoIds.has(video.id),
      }),
    ]),
  ) as Record<string, ContentReviewReadiness>;
}

function getVideoSortTimestamp(video: Pick<Video, "uploaded_at" | "created_at">) {
  const raw = video.uploaded_at ?? video.created_at;
  const timestamp = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * 受限并发执行：批次数量随视频量增长（1820 条 → 10 批），不设上限会在高峰期打满数据库连接。
 * 失败语义与 Promise.all 一致——每个任务都跑完，错误由调用方逐个断言。
 */
async function runWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item) => PromiseLike<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await run(items[index]);
      }
    }),
  );
  return results;
}

async function selectInBatches<Row>(
  ids: string[],
  run: (batch: string[]) => Promise<{ data: unknown[] | null; error?: { message?: string } | null }>,
) {
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += FULL_QUERY_BATCH_SIZE) {
    const batch = ids.slice(index, index + FULL_QUERY_BATCH_SIZE);
    if (batch.length === 0) continue;
    const { data, error } = await run(batch);
    assertSupabaseQuerySucceeded(error, "批量加载内容数据失败");
    if (data?.length) {
      rows.push(...(data as Row[]));
    }
  }
  return rows;
}

async function selectInBatchesParallel<Row>(
  ids: string[],
  run: (batch: string[]) => Promise<{ data: unknown[] | null; error?: { message?: string } | null }>,
) {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += FULL_QUERY_BATCH_SIZE) {
    const batch = ids.slice(index, index + FULL_QUERY_BATCH_SIZE);
    if (batch.length > 0) batches.push(batch);
  }
  const results = await runWithConcurrency(batches, QUERY_CONCURRENCY_LIMIT, (batch) => run(batch));
  const rows: Row[] = [];
  for (const result of results) {
    assertSupabaseQuerySucceeded(result.error, "批量加载内容数据失败");
    if (result.data?.length) {
      rows.push(...(result.data as Row[]));
    }
  }
  return rows;
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
    const isSurge =
      currentPlayCount - previousPlayCount >= PLAY_CHANGE_SURGE_DELTA_MIN &&
      playCountChangePct >= 100;
    const isHalve =
      currentPlayCount >= PLAY_CHANGE_HALVE_CURRENT_FLOOR &&
      playCountChangePct <= -50;
    const playChangeSignal: Video["play_change_signal"] =
      isSurge ? "surge"
        : isHalve ? "halve"
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

  const previousVideoResults = await runWithConcurrency(
    Array.from(videosByAccountId.entries()),
    QUERY_CONCURRENCY_LIMIT,
    ([accountId, accountVideos]) => {
      const oldestKnownPublishedAt = accountVideos.reduce((oldest, video) => {
        const publishedAt = new Date(video.published_at!).getTime();
        return Math.min(oldest, publishedAt);
      }, Number.POSITIVE_INFINITY);

      return supabase
        .from("videos")
        .select(PREVIOUS_VIDEO_SELECT)
        .eq("lifecycle_state", "active")
        .eq("account_id", accountId)
        .lt("published_at", new Date(oldestKnownPublishedAt).toISOString())
        .order("published_at", { ascending: false })
        .limit(1);
    },
  );
  for (const result of previousVideoResults) {
    assertSupabaseQuerySucceeded(result.error, "加载上一条视频失败");
  }

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
  view = "all",
  perspective = "company",
  teamId = null,
  permissionInfo,
  scope,
}: {
  supabase: LoaderSupabase;
  view?: "all" | "trash";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
}): Promise<AdminContentPageData> {
  const resolvedScope = scope
    ?? (permissionInfo
      ? await buildDataAccessScope(createAdminClient(), permissionInfo.userId, {
          perspective,
          teamId,
          profile: {
            id: permissionInfo.userId,
            role: permissionInfo.role,
            permissions: permissionInfo.permissions,
            data_scope: permissionInfo.dataScope,
            team_id: permissionInfo.teamId,
          },
        })
      : null);

  // 单次请求受 Supabase 默认 1000 行上限截断，必须稳定分页取全，否则老视频会静默消失
  const [videosRaw, profiles] = await Promise.all([
    fetchAllQueryPages<RawVideoRow>(
      (from, to) =>
        supabase
          .from("videos")
          .select(CONTENT_VIDEO_SELECT)
          .eq("lifecycle_state", view === "trash" ? "trashed" : "active")
          .order("uploaded_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      "加载内容视频失败",
    ),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }).then((result) => {
      assertSupabaseQuerySucceeded(result.error, "加载成员列表失败");
      return result.data ?? [];
    }),
  ]);

  const allVideos = normalizeVideoRows(videosRaw).sort(
    (left, right) => getVideoSortTimestamp(right) - getVideoSortTimestamp(left),
  );
  const videos = resolvedScope
    ? filterRowsByDataScope(resolvedScope, allVideos, (video) => video.accounts?.profile_id ?? video.user_id)
    : allVideos;
  const fallbackProfileIds = videos.map((video) => video.accounts?.profile_id ?? video.user_id).filter((id): id is string => Boolean(id));

  const visibleVideoIds = videos.map((video) => video.id);
  const [snapshotRows, segmentRows] = await Promise.all([
    visibleVideoIds.length > 0
      ? selectInBatchesParallel<VideoMetricsSnapshot>(visibleVideoIds, (batch) =>
          Promise.resolve(supabase
            .from("video_metrics_snapshots")
            .select(CONTENT_SNAPSHOT_SELECT)
            .eq("snapshot_type", "24h")
            .in("video_id", batch)
            .order("captured_at", { ascending: false })),
        )
      : Promise.resolve([]),
    visibleVideoIds.length > 0
      ? selectInBatchesParallel<SegmentRow>(visibleVideoIds, (batch) =>
          Promise.resolve(supabase.from("video_content_segments").select("video_id").in("video_id", batch)),
        )
      : Promise.resolve([]),
  ]);
  // 列表与排序只消费每视频最新一条 24h 快照，避免把历史快照整包搬进浏览器
  const snapshots = Array.from(buildLatestVideoSnapshotMap(snapshotRows).values());
  const videosWithSignals = await loadPlayChangeSignals({
    supabase,
    videos,
    previousCandidateVideos: videos,
    currentSnapshots: snapshots as PreviousSnapshotRow[],
  });
  const snapshotVideoIds = new Set(snapshots.map((snapshot) => snapshot.video_id as string));
  const segmentedVideoIds = new Set(segmentRows.map((row) => row.video_id));
  const reviewReadiness = buildReviewReadinessMap({
    videos: videosWithSignals,
    snapshotVideoIds,
    segmentedVideoIds,
  });

  return {
    videos: videosWithSignals,
    snapshots,
    profiles: buildScopedProfileOptions(profiles, resolvedScope, fallbackProfileIds),
    reviewReadiness,
    summary: {
      totalVideos: videos.length,
    },
  };
}

export async function loadAdminContentVideoDetail({
  supabase,
  scope,
  videoId,
  lifecycleState = "active",
}: {
  supabase: LoaderSupabase;
  scope: NonNullable<ScopeInput>;
  videoId: string;
  lifecycleState?: "active" | "trashed";
}): Promise<AdminContentVideoDetail | null> {
  const normalizedVideoId = videoId.trim();
  if (!normalizedVideoId) return null;

  const videoResult = await supabase
    .from("videos")
    .select(CONTENT_VIDEO_SELECT)
    .eq("id", normalizedVideoId)
    .eq("lifecycle_state", lifecycleState)
    .maybeSingle();
  assertSupabaseQuerySucceeded(videoResult.error, "加载指定视频失败");
  if (!videoResult.data) return null;

  const video = normalizeVideoRows([videoResult.data as unknown as RawVideoRow])[0];
  const scopedVideos = filterRowsByDataScope(
    scope,
    [video],
    (row) => row.accounts?.profile_id ?? row.user_id,
  );
  if (scopedVideos.length === 0) return null;

  const [snapshotResult, segmentResult, topicTagResult] = await Promise.all([
    supabase
      .from("video_metrics_snapshots")
      .select(CONTENT_SNAPSHOT_SELECT)
      .eq("video_id", normalizedVideoId)
      .eq("snapshot_type", "24h")
      .order("captured_at", { ascending: false })
      .limit(1),
    supabase
      .from("video_content_segments")
      .select("video_id")
      .eq("video_id", normalizedVideoId),
    supabase
      .from("video_tags")
      .select("tag_value")
      .eq("video_id", normalizedVideoId)
      .eq("tag_dimension", "话题")
      .limit(1),
  ]);
  assertSupabaseQuerySucceeded(snapshotResult.error, "加载指定视频快照失败");
  assertSupabaseQuerySucceeded(segmentResult.error, "加载指定视频拆段失败");
  assertSupabaseQuerySucceeded(topicTagResult.error, "加载指定视频话题标签失败");

  const snapshot = ((snapshotResult.data ?? []) as VideoMetricsSnapshot[])[0] ?? null;
  const hasSegments = ((segmentResult.data ?? []) as SegmentRow[]).some(
    (row) => row.video_id === normalizedVideoId,
  );
  const topicTag =
    ((topicTagResult.data ?? []) as Array<{ tag_value: string | null }>)[0]?.tag_value ?? null;

  return {
    video,
    snapshot,
    topicKind: classifyVideoTopicKind(topicTag),
    reviewReadiness: buildReviewReadinessMap({
      videos: [video],
      snapshotVideoIds: new Set(snapshot ? [normalizedVideoId] : []),
      segmentedVideoIds: new Set(hasSegments ? [normalizedVideoId] : []),
    }),
  };
}

export type AdminContentListArgs = {
  supabase: LoaderSupabase;
  view?: "all" | "trash";
  perspective?: AdminDataPerspective;
  teamId?: string | null;
  permissionInfo?: UserPermissionInfo;
  scope?: ScopeInput;
  /** 写操作（移入回收站/恢复/补录等）后的首次取数：跳过缓存读取，并把最新结果回填缓存 */
  fresh?: boolean;
};

const adminContentListCache = new Map<string, { expiresAt: number; payload: AdminContentPageData }>();
const ADMIN_CONTENT_LIST_CACHE_MAX_ENTRIES = 64;

export function clearAdminContentListCache() {
  adminContentListCache.clear();
}

function buildAdminContentListCacheKey(input: {
  view: "all" | "trash";
  perspective: AdminDataPerspective;
  teamId: string | null;
  userId: string;
  scopeKind: string;
  visibleUserIds: string[];
}) {
  return [
    input.view,
    input.perspective,
    input.teamId ?? "",
    input.userId,
    input.scopeKind,
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
}

/**
 * 首屏与列表刷新共用的取数入口：同范围 60 秒内复用服务端计算结果，
 * 避免每次翻页/切视角都重算全量指标。
 */
export async function loadAdminContentListData(args: AdminContentListArgs): Promise<AdminContentPageData> {
  const resolvedScope = args.scope
    ?? (args.permissionInfo
      ? await buildDataAccessScope(createAdminClient(), args.permissionInfo.userId, {
          perspective: args.perspective ?? "company",
          teamId: args.teamId ?? null,
          profile: {
            id: args.permissionInfo.userId,
            role: args.permissionInfo.role,
            permissions: args.permissionInfo.permissions,
            data_scope: args.permissionInfo.dataScope,
            team_id: args.permissionInfo.teamId,
          },
        })
      : null);

  const cacheKey = buildAdminContentListCacheKey({
    view: args.view ?? "all",
    perspective: args.perspective ?? "company",
    teamId: args.teamId ?? null,
    // 身份缺失时退化成只按数据范围缓存，会把他人结果复用给下一个调用方，因此优先取 scope 内的 userId
    userId: resolvedScope?.userId ?? args.permissionInfo?.userId ?? "",
    scopeKind: resolvedScope?.kind ?? "",
    visibleUserIds: resolvedScope?.visibleUserIds ?? [],
  });
  const cached = adminContentListCache.get(cacheKey);
  if (!args.fresh && cached && cached.expiresAt > Date.now()) return cached.payload;

  const payload = await loadAdminContentPageData({
    supabase: args.supabase,
    view: args.view,
    perspective: args.perspective,
    teamId: args.teamId,
    permissionInfo: args.permissionInfo,
    scope: resolvedScope,
  });
  // 超出上限时淘汰最早写入的一条（LRU），而不是全量清空——全清会让后续请求集体重算
  if (adminContentListCache.size >= ADMIN_CONTENT_LIST_CACHE_MAX_ENTRIES) {
    const oldestKey = adminContentListCache.keys().next().value;
    if (oldestKey !== undefined) adminContentListCache.delete(oldestKey);
  }
  adminContentListCache.set(cacheKey, {
    expiresAt: Date.now() + ADMIN_CONTENT_LIST_CACHE_TTL_MS,
    payload,
  });
  return payload;
}

export const __internal = {
  FULL_QUERY_BATCH_SIZE,
  PLAY_CHANGE_SURGE_DELTA_MIN,
  PLAY_CHANGE_HALVE_CURRENT_FLOOR,
  CONTENT_VIDEO_SELECT,
  CONTENT_SNAPSHOT_SELECT,
  attachPlayChangeSignals,
  findPreviousVideoByVisibleId,
  normalizeVideoRows,
  selectInBatches,
  getVideoSortTimestamp,
  buildScopedProfileOptions,
  buildReviewReadinessMap,
};
