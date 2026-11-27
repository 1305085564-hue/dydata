import { buildScopedProfileOptions } from "@/lib/content/content-owner";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import { loadEvaluationSettings } from "@/lib/evaluation-standards-store";
import { queryAdminContentRpcPage, resolveAdminContentUnfilteredTotal } from "./admin-content-rpc";
import { loadPageTopicLibraryStatuses } from "./admin-content-topic-library";
import { attachPlayChangeSignals, findPreviousVideoByVisibleId, type PreviousSnapshotRow, type PreviousVideoCandidateRow } from "./admin-content-play-signals";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseQuerySucceeded, fetchAllQueryPages } from "@/lib/supabase/query-error";
import { buildLatestVideoSnapshotMap } from "@/lib/video-snapshot-map";
import { getPublishedDateKey } from "@/lib/date-semantics";
import { classifyVideoTopicKind, type VideoTopicKind, type VideoTopicLibraryStatusInfo } from "@/lib/topics/library";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { ContentReviewReadiness, Profile, Video, VideoMetricsSnapshot } from "@/types";
import { buildContentQualityRecord, type ContentQualityTopicContext } from "@/lib/content-quality";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { bindContentListQueryToEffectiveScope, buildContentQueryFingerprint, decodeContentCursor, encodeContentCursor, type ContentListQuery } from "@/lib/content/domain/content-list-query";

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
type SegmentRow = { video_id: string };

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, review_status, reviewed_at, lifecycle_state, trashed_at, trashed_by, purged_at, purged_by, created_at, accounts!inner(name, profile_id), profiles!videos_user_id_fkey!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url";

const PREVIOUS_VIDEO_SELECT = "id, account_id, published_at";
const PREVIOUS_SNAPSHOT_SELECT = "video_id, play_count, captured_at";

const FULL_QUERY_BATCH_SIZE = 200;
/** 单请求内并发查询上限：批次查询与按账号边界查询共用，避免上千条视频时打满连接池 */
const QUERY_CONCURRENCY_LIMIT = 6;
const PLAY_CHANGE_SURGE_DELTA_MIN = 5_000;

export interface AdminContentPageData {
  evaluationStandards?: EvaluationStandards;
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  ownerNames?: Record<string, string>;
  accountOptions?: Array<{ id: string; name: string }>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  /** 列表范围内每条视频的统一内容质量结果；Record 可直接随 JSON 刷新传输。 */
  contentQualityByVideoId: Record<string, WorkContentQuality>;
  /**
   * 当前页视频的选题库状态，与 /api/admin/content/topic-library-status 同口径。
   * 仅在调用方显式要求且有「作品复盘只读」权限时下发；查询失败时保持 undefined，
   * 前端会回退到原状态接口，列表本身不受影响。
   */
  topicLibraryStatuses?: Record<string, VideoTopicLibraryStatusInfo>;
  summary: {
    totalVideos: number;
    /** 当前日期窗口内未应用收窄筛选（评级/账号/成员/播放/异常/关键词等）时的真实总基数。 */
    unfilteredTotalVideos?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    anomalyCount?: number;
    pageStartIndex?: number;
    hasPreviousPage?: boolean;
    hasNextPage?: boolean;
    directReviewVideoId?: string | null;
  };
  /** 当前筛选范围内（不含日期过滤）有作品的日期，降序，供日期翻页器使用 */
  availableDates?: string[];
  availableCounts?: Array<{ d: string; c: number }>;
  diagnostics?: {
    rowsRead: number;
    snapshotRowsRead: number;
    returnedRows: number;
    rpcDurationMs?: number;
    evaluationStandardsVersion?: number;
  };
  cursors?: { previous: string | null; next: string | null };
}

async function loadContentQualityTopicTags(
  supabase: LoaderSupabase,
  videoIds: string[],
): Promise<ContentQualityTopicContext> {
  const tags = new Map<string, string | null>(videoIds.map((id) => [id, null]));
  if (videoIds.length === 0) return { state: "ready", tags };
  try {
    const rows = await selectInBatchesParallel<{ video_id: string; tag_value: string | null }>(
      videoIds,
      (batch) => Promise.resolve(
        supabase
          .from("video_tags")
          .select("video_id, tag_value")
          .eq("tag_dimension", "话题")
          .in("video_id", batch),
      ),
    );
    for (const row of rows) {
      if (row.video_id && tags.has(row.video_id)) tags.set(row.video_id, row.tag_value ?? null);
    }
    return { state: "ready", tags };
  } catch {
    return { state: "error", tags: new Map() };
  }
}

export interface AdminContentVideoDetail {
  evaluationStandards?: EvaluationStandards;
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  /** 与列表同源的统一内容质量结果。旧详情响应缺字段时按 null 兼容。 */
  contentQuality?: WorkContentQuality | null;
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

function buildReviewReadinessMap({
  videos,
  snapshotVideoIds,
  segmentedVideoIds,
  contentPresenceByVideoId,
}: {
  videos: VideoRow[];
  snapshotVideoIds: Set<string>;
  segmentedVideoIds: Set<string>;
  contentPresenceByVideoId?: Map<string, boolean>;
}) {
  return Object.fromEntries(
    videos.map((video) => {
      const readiness = buildContentReviewReadiness({
        video,
        hasSnapshot24h: snapshotVideoIds.has(video.id),
        hasSegments: segmentedVideoIds.has(video.id),
      });
      const hasContent = contentPresenceByVideoId?.get(video.id);
      if (hasContent === undefined) return [video.id, readiness];
      const hasSnapshot = snapshotVideoIds.has(video.id);
      const hasSegments = segmentedVideoIds.has(video.id);
      const status = !hasSnapshot ? "missing_snapshot" : !hasContent ? "missing_content" : !hasSegments ? "missing_segments" : "ready";
      const label = status === "missing_snapshot" ? "缺24h数据" : status === "missing_content" ? "缺文案" : status === "missing_segments" ? "缺拆段" : "数据齐全";
      return [video.id, { ...readiness, status, label, has_content: hasContent, can_generate: hasSnapshot && hasContent }];
    }),
  ) as Record<string, ContentReviewReadiness>;
}

function getVideoSortTimestamp(video: Pick<Video, "published_at" | "uploaded_at">) {
  const raw = video.published_at;
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
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
  supabase,
  view = "all",
  perspective = "company",
  teamId = null,
  permissionInfo,
  scope,
}: {
  supabase: LoaderSupabase;
  evaluationStandards?: EvaluationStandards;
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
  const [snapshotRows, segmentRows, topicTags] = await Promise.all([
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
    loadContentQualityTopicTags(supabase, visibleVideoIds),
  ]);
  // 列表与排序只消费每视频最新一条 24h 快照，避免把历史快照整包搬进浏览器
  const snapshots = Array.from(buildLatestVideoSnapshotMap(snapshotRows).values());
  const snapshotVideoIds = new Set(snapshots.map((snapshot) => snapshot.video_id as string));
  const segmentedVideoIds = new Set(segmentRows.map((row) => row.video_id));
  const contentQualityByVideoId = buildContentQualityRecord(
    visibleVideoIds,
    new Map(
      snapshots.map((snapshot) => [snapshot.video_id, {
        playCount: snapshot.play_count,
        likes: snapshot.likes,
        comments: snapshot.comments,
        shares: snapshot.shares,
        favorites: snapshot.favorites,
        avgPlayDuration: snapshot.avg_play_duration,
        avgPlayRatio: snapshot.avg_play_ratio,
        bounceRate2s: snapshot.bounce_rate_2s,
        completionRate5s: snapshot.completion_rate_5s,
        completionRate: snapshot.completion_rate,
      }]),
    ),
    topicTags,
    evaluationStandards,
  );
  const reviewReadiness = buildReviewReadinessMap({
    videos,
    snapshotVideoIds,
    segmentedVideoIds,
  });
  const videosWithSignals = await loadPlayChangeSignals({
    supabase,
    videos,
    previousCandidateVideos: videos,
    currentSnapshots: snapshots as PreviousSnapshotRow[],
  });

  return {
    videos: videosWithSignals,
    snapshots,
    profiles: buildScopedProfileOptions(profiles, resolvedScope, fallbackProfileIds),
    ownerNames: Object.fromEntries(profiles.filter(p => fallbackProfileIds.includes(p.id)).map(p => [p.id, p.name])),
    reviewReadiness,
    contentQualityByVideoId,
    evaluationStandards,
    availableDates: [...new Set(videosWithSignals.map((v) => getPublishedDateKey(v)).filter((d): d is string => Boolean(d)))].sort((a, b) => b.localeCompare(a)),
    availableCounts: Object.entries(videosWithSignals.reduce<Record<string, number>>((acc, v) => { const d = getPublishedDateKey(v); if (d) acc[d] = (acc[d] ?? 0) + 1; return acc; }, {})).map(([d, c]) => ({ d, c })).sort((a, b) => b.d.localeCompare(a.d)),
    summary: {
      totalVideos: videos.length,
      unfilteredTotalVideos: videos.length,
    },
  };
}

export async function loadAdminContentVideoDetail({
  supabase,
  scope,
  videoId,
  lifecycleState = "active",
  includeEvaluationStandards = true,
}: {
  supabase: LoaderSupabase;
  scope: NonNullable<ScopeInput>;
  videoId: string;
  lifecycleState?: "active" | "trashed";
  /** 截图授权只核对关联证据，不依赖评价标准配置。 */
  includeEvaluationStandards?: boolean;
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

  const evaluationStandards = includeEvaluationStandards && scope.teamId
    ? (await loadEvaluationSettings(supabase, scope.teamId)).standards
    : DEFAULT_EVALUATION_STANDARDS;
  const contentQuality = buildContentQualityRecord(
    [normalizedVideoId],
    new Map(snapshot ? [[normalizedVideoId, {
      playCount: snapshot.play_count,
      likes: snapshot.likes,
      comments: snapshot.comments,
      shares: snapshot.shares,
      favorites: snapshot.favorites,
      avgPlayDuration: snapshot.avg_play_duration,
      avgPlayRatio: snapshot.avg_play_ratio,
      bounceRate2s: snapshot.bounce_rate_2s,
      completionRate5s: snapshot.completion_rate_5s,
      completionRate: snapshot.completion_rate,
    }]] : []),
    { state: "ready", tags: new Map([[normalizedVideoId, topicTag]]) },
    evaluationStandards,
  )[normalizedVideoId] ?? null;

  // 详情与列表同源计算播放涨跌信号，保证同一作品两处口径一致（审计 H1）
  const [videoWithSignal = video] = await loadPlayChangeSignals({ supabase, videos: [video],
    previousCandidateVideos: [video], currentSnapshots: (snapshot ? [snapshot] : []) as PreviousSnapshotRow[] });

  return {
    evaluationStandards,
    video: videoWithSignal,
    snapshot,
    contentQuality,
    topicKind: classifyVideoTopicKind(topicTag),
    reviewReadiness: buildReviewReadinessMap({
      videos: [videoWithSignal],
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
  query?: ContentListQuery;
  /**
   * 是否随当前页视频下发选题库状态。只有数据复盘列表页（SSR 与 GET 列表接口）需要；
   * 作者作品抽屉等批量复用列表的分页调用不打开，避免每页多算一遍。
   */
  includeTopicLibraryStatuses?: boolean;
};

type AdminContentRpcPage = {
  cursorValid?: boolean;
  videos?: RawVideoRow[];
  snapshots?: VideoMetricsSnapshot[];
  summary?: AdminContentPageData["summary"];
  diagnostics?: AdminContentPageData["diagnostics"];
  accountOptions?: Array<{ id: string; name: string }>;
  availableDates?: string[]; availableCounts?: Array<{ d: string; c: number }>;
  cursors?: {
    previous?: { sortValue: number | string | null; id: string; direction: "before" | "after" } | null;
    next?: { sortValue: number | string | null; id: string; direction: "before" | "after" } | null;
  };
};

async function loadAdminContentRpcPageData({
  evaluationStandards,
  supabase,
  query,
  scope,
  permissionInfo,
  includeTopicLibraryStatuses = false,
}: {
  supabase: LoaderSupabase;
  evaluationStandards: EvaluationStandards;
  query: ContentListQuery;
  scope: NonNullable<ScopeInput>;
  permissionInfo?: UserPermissionInfo;
  includeTopicLibraryStatuses?: boolean;
}): Promise<AdminContentPageData> {
  if (typeof (supabase as SupabaseClient & { rpc?: unknown }).rpc !== "function") {
    throw new Error("admin_content_list_page RPC client unavailable");
  }

  const effectiveQuery = bindContentListQueryToEffectiveScope(query, scope.teamId);
  const cursor = decodeContentCursor(effectiveQuery.cursor);
  const queryFingerprint = JSON.stringify([buildContentQueryFingerprint(effectiveQuery), evaluationStandards]);
  if (effectiveQuery.cursor && (!cursor || cursor.queryFingerprint !== queryFingerprint)) {
    throw new Error("CONTENT_LIST_CURSOR_STALE");
  }
  const { result, profilesResult, rpcDurationMs } = await queryAdminContentRpcPage({
    supabase, query: effectiveQuery, scope, cursor, evaluationStandards,
  });
  assertSupabaseQuerySucceeded(result.error, "加载内容分页失败");
  const payload = (result.data ?? {}) as AdminContentRpcPage;
  if (payload.diagnostics?.evaluationStandardsVersion !== 2) {
    throw new Error("评价标准与列表筛选版本不一致，请联系负责人");
  }
  if (effectiveQuery.cursor && payload.cursorValid === false) throw new Error("CONTENT_LIST_CURSOR_STALE");
  const rawVideos = (payload.videos ?? []) as Array<RawVideoRow & { has_content?: boolean }>;
  const videos = normalizeVideoRows(rawVideos);
  // 当前页视频一到手就并行解析选题库状态；后面的质量/就绪度组装是同步计算，不额外串行等待。
  const topicLibraryStatusesPromise = includeTopicLibraryStatuses
    ? loadPageTopicLibraryStatuses({
        supabase,
        videos: videos.map((video) => ({
          id: video.id,
          topic_id: (video as VideoRow & { topic_id?: string | null }).topic_id ?? null,
          user_id: video.user_id,
          accounts: video.accounts,
        })),
        scope,
        permissionInfo,
      })
    : Promise.resolve(undefined);
  const snapshots = (payload.snapshots ?? []) as VideoMetricsSnapshot[];
  const snapshotVideoIds = new Set(snapshots.map((snapshot) => String(snapshot.video_id)));
  const segmentedVideoIds = new Set(
    rawVideos.filter((video) => Boolean((video as RawVideoRow & { has_segments?: boolean }).has_segments)).map((video) => String(video.id)),
  );
  assertSupabaseQuerySucceeded(profilesResult.error, "加载成员列表失败");
  const profiles = (profilesResult.data ?? []) as FilterOption[];
  const topicTags = new Map<string, string | null>();
  for (const video of rawVideos) {
    const tag = (video as RawVideoRow & { topic_tag?: string | null }).topic_tag ?? null;
    topicTags.set(String(video.id), tag);
  }
  const contentQualityByVideoId = buildContentQualityRecord(
    videos.map((video) => video.id),
    new Map(snapshots.map((snapshot) => [String(snapshot.video_id), {
      playCount: snapshot.play_count,
      likes: snapshot.likes,
      comments: snapshot.comments,
      shares: snapshot.shares,
      favorites: snapshot.favorites,
      avgPlayDuration: snapshot.avg_play_duration,
      avgPlayRatio: snapshot.avg_play_ratio,
      bounceRate2s: snapshot.bounce_rate_2s,
      completionRate5s: snapshot.completion_rate_5s,
      completionRate: snapshot.completion_rate,
    }])),
    { state: "ready", tags: topicTags },
    evaluationStandards,
  );
  const reviewReadiness = buildReviewReadinessMap({
    videos,
    snapshotVideoIds,
    segmentedVideoIds,
    contentPresenceByVideoId: new Map(rawVideos.map((video) => [String(video.id), video.has_content === true])),
  });
  const [topicLibraryStatuses, unfilteredTotalVideos] = await Promise.all([
    topicLibraryStatusesPromise,
    resolveAdminContentUnfilteredTotal({
      supabase,
      query: effectiveQuery,
      scope,
      evaluationStandards,
      matchedTotal: payload.summary?.totalVideos ?? 0,
      availableDates: payload.availableDates,
      availableCounts: payload.availableCounts,
    }),
  ]);
  const summary = {
    totalVideos: 0, page: effectiveQuery.page, pageSize: effectiveQuery.pageSize, totalPages: 1,
    anomalyCount: 0, pageStartIndex: (effectiveQuery.page - 1) * effectiveQuery.pageSize,
    hasPreviousPage: effectiveQuery.page > 1, hasNextPage: false, directReviewVideoId: null,
    ...(payload.summary ?? {}),
    ...(typeof unfilteredTotalVideos === "number" ? { unfilteredTotalVideos } : {}),
  };
  return {
    videos,
    snapshots,
    profiles: buildScopedProfileOptions(profiles, scope),
    ownerNames: Object.fromEntries(profiles.map(p => [p.id, p.name])),
    accountOptions: payload.accountOptions ?? [],
    reviewReadiness,
    contentQualityByVideoId,
    ...(topicLibraryStatuses ? { topicLibraryStatuses } : {}),
    evaluationStandards,
    summary,
    availableDates: payload.availableDates ?? [],
    availableCounts: payload.availableCounts ?? [],
    diagnostics: payload.diagnostics ? {
      ...payload.diagnostics,
      rpcDurationMs,
    } : undefined,
    cursors: payload.cursors ? {
      previous: payload.cursors.previous
        ? encodeContentCursor({ ...payload.cursors.previous, sortValue: payload.cursors.previous.sortValue == null ? null : String(payload.cursors.previous.sortValue), queryFingerprint })
        : null,
      next: payload.cursors.next
        ? encodeContentCursor({ ...payload.cursors.next, sortValue: payload.cursors.next.sortValue == null ? null : String(payload.cursors.next.sortValue), queryFingerprint })
        : null,
    } : { previous: null, next: null },
  };
}

/**
 * 首屏与列表刷新共用的取数入口。每个请求都从数据库重新读取，
 * 让作品编辑、快照、标签、分段和生命周期等任一写入口及时反映到列表。
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

  const evaluationStandards = resolvedScope?.teamId
    ? (await loadEvaluationSettings(args.supabase, resolvedScope.teamId)).standards
    : DEFAULT_EVALUATION_STANDARDS;
  const effectiveQuery = args.query && resolvedScope
    ? bindContentListQueryToEffectiveScope(args.query, resolvedScope.teamId)
    : args.query;
  const payload = resolvedScope && effectiveQuery
    ? await loadAdminContentRpcPageData({
        supabase: args.supabase,
        query: effectiveQuery,
        scope: resolvedScope,
        evaluationStandards,
        permissionInfo: args.permissionInfo,
        includeTopicLibraryStatuses: args.includeTopicLibraryStatuses === true,
      })
    : await loadAdminContentPageData({
        supabase: args.supabase,
        view: args.view,
        perspective: args.perspective,
        teamId: args.teamId,
        permissionInfo: args.permissionInfo,
        scope: resolvedScope,
        evaluationStandards,
      });
  return payload;
}

export const __internal = {
  FULL_QUERY_BATCH_SIZE,
  PLAY_CHANGE_SURGE_DELTA_MIN,
  CONTENT_VIDEO_SELECT,
  CONTENT_SNAPSHOT_SELECT,
  attachPlayChangeSignals,
  findPreviousVideoByVisibleId,
  normalizeVideoRows,
  selectInBatches,
  getVideoSortTimestamp,
  buildScopedProfileOptions,
  buildReviewReadinessMap,
  loadPageTopicLibraryStatuses,
};
