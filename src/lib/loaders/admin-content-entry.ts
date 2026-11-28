import { buildScopedProfileOptions } from "@/lib/content/content-owner";
import { bindContentListQueryToEffectiveScope } from "@/lib/content/domain/content-list-query";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { loadEvaluationSettings } from "@/lib/evaluation-standards-store";
import { attachPlayChangeSignals,findPreviousVideoByVisibleId } from "@/lib/loaders/admin-content-play-signals";
import { loadPageTopicLibraryStatuses } from "@/lib/loaders/admin-content-topic-library";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminContentListArgs,AdminContentPageData } from "./admin-content-contract";
import { CONTENT_SNAPSHOT_SELECT,CONTENT_VIDEO_SELECT,FULL_QUERY_BATCH_SIZE,PLAY_CHANGE_SURGE_DELTA_MIN } from "./admin-content-contract";
import { buildReviewReadinessMap,getVideoSortTimestamp,normalizeVideoRows,selectInBatches } from "./admin-content-enrichment";
import { loadAdminContentPageData } from "./admin-content-full";
import { loadAdminContentRpcPageData } from "./admin-content-pagination";

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
