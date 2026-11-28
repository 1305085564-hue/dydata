import { hasFixedPermission } from "@/lib/company-permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { buildDataAccessScope } from "@/lib/data-access-scope";
import { resolveVideoTopicLibraryStatuses, type VideoTopicLibraryStatusInfo } from "@/lib/topics/library";
import type { UserPermissionInfo } from "@/lib/permissions";

type ScopeInput = Awaited<ReturnType<typeof buildDataAccessScope>>;

/**
 * 列表页随当前页视频一起下发选题库状态，省掉前端首屏再发一批 POST。
 *
 * 权限与失败口径对齐 /api/admin/content/topic-library-status：
 * - 只有具备「作品复盘只读」（view_video_review）时才计算，否则不下发，前端回退原接口；
 * - 只返回可见范围内的视频，范围为空返回空对象；
 * - 查询失败不拖垮列表，记日志后不下发，由前端原接口兜底并提示。
 */
export async function loadPageTopicLibraryStatuses({
  supabase,
  videos,
  scope,
  permissionInfo,
}: {
  supabase: SupabaseClient;
  videos: Array<{ id: string; topic_id?: string | null; user_id?: string | null; accounts?: { profile_id?: string | null } | null }>;
  scope: ScopeInput;
  permissionInfo?: UserPermissionInfo;
}): Promise<Record<string, VideoTopicLibraryStatusInfo> | undefined> {
  if (!permissionInfo || !hasFixedPermission(permissionInfo.companyRole ?? permissionInfo.role, "view_video_review")) return undefined;
  if (!scope) return undefined;
  const visibleUserIds = new Set(scope.visibleUserIds);
  const scopedVideos = videos
    .filter((video) => {
      const ownerId = video.accounts?.profile_id ?? video.user_id ?? null;
      return Boolean(ownerId && visibleUserIds.has(ownerId));
    })
    .map((video) => ({ id: video.id, topic_id: video.topic_id ?? null }));
  if (scopedVideos.length === 0) return {};
  try {
    return await resolveVideoTopicLibraryStatuses(supabase, scopedVideos);
  } catch (error) {
    console.error("[content-list] 选题库状态下发失败，回退前端状态接口", error);
    return undefined;
  }
}
