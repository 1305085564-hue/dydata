import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildContentQualityRecord } from "@/lib/content-quality";
import { buildScopedProfileOptions } from "@/lib/content/content-owner";
import { buildDataAccessScope,filterRowsByDataScope } from "@/lib/data-access-scope";
import { getPublishedDateKey } from "@/lib/date-semantics";
import { DEFAULT_EVALUATION_STANDARDS,type EvaluationStandards } from "@/lib/evaluation-standards";
import { loadEvaluationSettings } from "@/lib/evaluation-standards-store";
import { type PreviousSnapshotRow } from "@/lib/loaders/admin-content-play-signals";
import { attachSettlementExclusionsToVideos,buildSettlementExclusionMapFromVideos,isMissingSettlementColumn,loadVideoSettlementExclusions } from "@/lib/loaders/admin-content-rpc";
import type { UserPermissionInfo } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { readQueryPages } from "@/lib/supabase/paged-query";
import { assertSupabaseQuerySucceeded,fetchAllQueryPages } from "@/lib/supabase/query-error";
import { classifyVideoTopicKind } from "@/lib/topics/library";
import { buildLatestVideoSnapshotMap } from "@/lib/video-snapshot-map";
import type { VideoMetricsSnapshot } from "@/types";
import type { AdminContentPageData,AdminContentVideoDetail,LoaderSupabase,RawVideoRow,ScopeInput,SegmentRow } from "./admin-content-contract";
import { CONTENT_SNAPSHOT_SELECT,CONTENT_VIDEO_SELECT,CONTENT_VIDEO_SELECT_BASE } from "./admin-content-contract";
import { buildReviewReadinessMap,getVideoSortTimestamp,loadContentQualityTopicTags,loadPlayChangeSignals,normalizeVideoRows,selectInBatchesParallel } from "./admin-content-enrichment";

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

  // 单次请求受 Supabase 默认 1000 行上限截断，必须稳定分页取全，否则老视频/成员会静默消失
  const [videosRaw, profiles] = await Promise.all([
    fetchAllQueryPages<RawVideoRow>(
      (from, to) =>
        supabase
          .from("videos")
          .select(CONTENT_VIDEO_SELECT_BASE)
          .eq("lifecycle_state", view === "trash" ? "trashed" : "active")
          .order("uploaded_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      "加载内容视频失败",
    ),
    fetchAllQueryPages<{ id: string; name: string }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, name")
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "加载成员列表失败",
    ),
  ]);

  const allVideos = normalizeVideoRows(videosRaw).sort(
    (left, right) => getVideoSortTimestamp(right) - getVideoSortTimestamp(left),
  );
  const videos = resolvedScope
    ? filterRowsByDataScope(resolvedScope, allVideos, (video) => video.accounts?.profile_id ?? video.user_id)
    : allVideos;
  const fallbackProfileIds = videos.map((video) => video.accounts?.profile_id ?? video.user_id).filter((id): id is string => Boolean(id));

  const visibleVideoIds = videos.map((video) => video.id);
  // 200 条 video_id 一对多关联快照/拆段仍可能突破默认 1000 行上限，批内同样按唯一主键稳定翻页
  const [snapshotRows, segmentRows, topicTags, settlementExclusions] = await Promise.all([
    visibleVideoIds.length > 0
      ? selectInBatchesParallel<VideoMetricsSnapshot>(visibleVideoIds, (batch) =>
          readQueryPages((from, to, signal) =>
            supabase
              .from("video_metrics_snapshots")
              .select(CONTENT_SNAPSHOT_SELECT)
              .eq("snapshot_type", "24h")
              .in("video_id", batch)
              .order("captured_at", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to)
              .abortSignal(signal),
          ),
        )
      : Promise.resolve([]),
    visibleVideoIds.length > 0
      ? selectInBatchesParallel<SegmentRow>(visibleVideoIds, (batch) =>
          readQueryPages((from, to, signal) =>
            supabase
              .from("video_content_segments")
              .select("video_id")
              .in("video_id", batch)
              .order("id", { ascending: true })
              .range(from, to)
              .abortSignal(signal),
          ),
        )
      : Promise.resolve([]),
    loadContentQualityTopicTags(supabase, visibleVideoIds),
    loadVideoSettlementExclusions(supabase, visibleVideoIds),
  ]);
  // 列表与排序只消费每视频最新一条 24h 快照，避免把历史快照整包搬进浏览器
  const snapshots = Array.from(buildLatestVideoSnapshotMap(snapshotRows).values());
  const snapshotVideoIds = new Set(snapshots.map((snapshot) => snapshot.video_id as string));
  const segmentedVideoIds = new Set(segmentRows.map((row) => row.video_id));
  const contentQualityByVideoId = buildContentQualityRecord(
    visibleVideoIds,
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
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
    settlementExclusions,
  );
  const videosWithSettlement = attachSettlementExclusionsToVideos(videos, settlementExclusions);
  const reviewReadiness = buildReviewReadinessMap({
    videos: videosWithSettlement,
    snapshotVideoIds,
    segmentedVideoIds,
  });
  const videosWithSignals = await loadPlayChangeSignals({
    supabase,
    videos: videosWithSettlement,
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

  let videoResult = await supabase
    .from("videos")
    .select(CONTENT_VIDEO_SELECT)
    .eq("id", normalizedVideoId)
    .eq("lifecycle_state", lifecycleState)
    .maybeSingle();
  if (isMissingSettlementColumn(videoResult.error)) {
    videoResult = await supabase
      .from("videos")
      .select(CONTENT_VIDEO_SELECT_BASE)
      .eq("id", normalizedVideoId)
      .eq("lifecycle_state", lifecycleState)
      .maybeSingle();
  }
  assertSupabaseQuerySucceeded(videoResult.error, "加载指定视频失败");
  if (!videoResult.data) return null;

  const video = normalizeVideoRows([videoResult.data as unknown as RawVideoRow])[0];
  const scopedVideos = filterRowsByDataScope(
    scope,
    [video],
    (row) => row.accounts?.profile_id ?? row.user_id,
  );
  if (scopedVideos.length === 0) return null;

  const settlementExclusions = buildSettlementExclusionMapFromVideos([video]);
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
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
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
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
    { state: "ready", tags: new Map([[normalizedVideoId, topicTag]]) },
    evaluationStandards,
    settlementExclusions,
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
