import { type ContentQualityTopicContext } from "@/lib/content-quality";
import { buildContentReviewReadiness } from "@/lib/content-review-readiness";
import { attachPlayChangeSignals,findPreviousVideoByVisibleId,type PreviousSnapshotRow,type PreviousVideoCandidateRow } from "@/lib/loaders/admin-content-play-signals";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { ContentReviewReadiness,Video } from "@/types";
import type { LoaderSupabase,RawVideoRow,VideoRow } from "./admin-content-contract";
import { FULL_QUERY_BATCH_SIZE,PREVIOUS_SNAPSHOT_SELECT,PREVIOUS_VIDEO_SELECT,QUERY_CONCURRENCY_LIMIT } from "./admin-content-contract";

export async function loadContentQualityTopicTags(
  supabase: LoaderSupabase,
  videoIds: string[],
): Promise<ContentQualityTopicContext> {
  // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
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
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
    return { state: "error", tags: new Map() };
  }
}

export function readJoinedName(value: RawVideoRow["accounts"] | RawVideoRow["profiles"], fallback: string) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? fallback;
}

export function readJoinedAccount(value: RawVideoRow["accounts"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return {
    name: row?.name ?? "未命名账号",
    profile_id: row?.profile_id ?? null,
  };
}

export function normalizeVideoRows(rows: RawVideoRow[]): VideoRow[] {
  return rows.map((row) => ({
    ...row,
    accounts: readJoinedAccount(row.accounts),
    profiles: { name: readJoinedName(row.profiles, "未命名成员") },
  }));
}

export function buildReviewReadinessMap({
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

export function getVideoSortTimestamp(video: Pick<Video, "published_at" | "uploaded_at">) {
  const raw = video.published_at;
  const timestamp = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * 受限并发执行：批次数量随视频量增长（1820 条 → 10 批），不设上限会在高峰期打满数据库连接。
 * 失败语义与 Promise.all 一致——每个任务都跑完，错误由调用方逐个断言。
 */
export async function runWithConcurrency<Item, Result>(
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

export async function selectInBatches<Row>(
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

export async function selectInBatchesParallel<Row>(
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

export async function loadPlayChangeSignals({
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

  // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
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
