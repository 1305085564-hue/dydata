import { buildContentQualityRecord } from "@/lib/content-quality";
import { buildScopedProfileOptions } from "@/lib/content/content-owner";
import { bindContentListQueryToEffectiveScope,buildContentQueryFingerprint,decodeContentCursor,encodeContentCursor,type ContentListQuery } from "@/lib/content/domain/content-list-query";
import { type EvaluationStandards } from "@/lib/evaluation-standards";
import { attachSettlementExclusionsToVideos,loadVideoSettlementExclusions,queryAdminContentRpcPage,resolveAdminContentUnfilteredTotal } from "@/lib/loaders/admin-content-rpc";
import { loadPageTopicLibraryStatuses } from "@/lib/loaders/admin-content-topic-library";
import type { UserPermissionInfo } from "@/lib/permissions";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { VideoMetricsSnapshot } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContentPageData,AdminContentRpcPage,FilterOption,LoaderSupabase,RawVideoRow,ScopeInput,VideoRow } from "./admin-content-contract";
import { buildReviewReadinessMap,normalizeVideoRows } from "./admin-content-enrichment";

export async function loadAdminContentRpcPageData({
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
  // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
  const topicTags = new Map<string, string | null>();
  for (const video of rawVideos) {
    const tag = (video as RawVideoRow & { topic_tag?: string | null }).topic_tag ?? null;
    topicTags.set(String(video.id), tag);
  }
  const [topicLibraryStatuses, unfilteredTotalVideos, settlementExclusions] = await Promise.all([
    topicLibraryStatusesPromise,
    resolveAdminContentUnfilteredTotal({
      supabase, query: effectiveQuery, scope, evaluationStandards,
      matchedTotal: payload.summary?.totalVideos ?? 0,
      availableDates: payload.availableDates, availableCounts: payload.availableCounts,
    }),
    loadVideoSettlementExclusions(supabase, videos.map((video) => video.id)),
  ]);
  const videosWithSettlement = attachSettlementExclusionsToVideos(videos, settlementExclusions);
  const contentQualityByVideoId = buildContentQualityRecord(
    videosWithSettlement.map((video) => video.id),
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
    new Map(snapshots.map((snapshot) => [String(snapshot.video_id), {
      playCount: snapshot.play_count, likes: snapshot.likes, comments: snapshot.comments,
      shares: snapshot.shares, favorites: snapshot.favorites, avgPlayDuration: snapshot.avg_play_duration,
      avgPlayRatio: snapshot.avg_play_ratio, bounceRate2s: snapshot.bounce_rate_2s,
      completionRate5s: snapshot.completion_rate_5s, completionRate: snapshot.completion_rate,
    }])),
    { state: "ready", tags: topicTags },
    evaluationStandards,
    settlementExclusions,
  );
  const reviewReadiness = buildReviewReadinessMap({
    videos: videosWithSettlement, snapshotVideoIds, segmentedVideoIds,
    // gate:transient-map 单次内容加载内临时索引，随结果返回释放，不跨请求保存
    contentPresenceByVideoId: new Map(rawVideos.map((video) => [String(video.id), video.has_content === true])),
  });
  const summary = {
    totalVideos: 0, page: effectiveQuery.page, pageSize: effectiveQuery.pageSize, totalPages: 1,
    anomalyCount: 0, pageStartIndex: (effectiveQuery.page - 1) * effectiveQuery.pageSize,
    hasPreviousPage: effectiveQuery.page > 1, hasNextPage: false, directReviewVideoId: null,
    ...(payload.summary ?? {}),
    ...(typeof unfilteredTotalVideos === "number" ? { unfilteredTotalVideos } : {}),
  };
  return {
    videos: videosWithSettlement,
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
