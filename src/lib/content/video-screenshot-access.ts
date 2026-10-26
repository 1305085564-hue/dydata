import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { loadAdminContentVideoDetail } from "@/lib/loaders/content-detail";
import { __internal as screenshotAccess, parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveReviewScreenshots } from "@/lib/video-screenshot";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DefaultDependencies = {
  getCurrentPermissionContext: typeof getCurrentPermissionContext;
  createAdminClient: typeof createAdminClient;
  resolveVideoReviewReadOnlyScope: typeof resolveVideoReviewReadOnlyScope;
  loadAdminContentVideoDetail: typeof loadAdminContentVideoDetail;
};

export type ContentVideoScreenshotAccessDependencies = Partial<DefaultDependencies>;

const defaultDependencies: DefaultDependencies = {
  getCurrentPermissionContext,
  createAdminClient,
  resolveVideoReviewReadOnlyScope,
  loadAdminContentVideoDetail,
};

export async function canReadContentVideoScreenshot(
  input: { userId: string; videoId: string; path: string },
  dependencies: ContentVideoScreenshotAccessDependencies = {},
): Promise<boolean> {
  if (
    !UUID_PATTERN.test(input.userId)
    || !UUID_PATTERN.test(input.videoId)
    || !screenshotAccess.isSafeObjectPath(input.path)
  ) {
    return false;
  }

  const deps = { ...defaultDependencies, ...dependencies };
  const permissionContext = await deps.getCurrentPermissionContext();
  if (!permissionContext) return false;
  if (permissionContext.permissionInfo.userId !== input.userId) return false;
  if (permissionContext.permissionInfo.permissions.view_video_review !== true) return false;

  const supabase = deps.createAdminClient() as SupabaseClient;
  const scope = await deps.resolveVideoReviewReadOnlyScope(supabase, permissionContext.scope);
  // 作品引用本身不能跨越公司文件边界，即使快照误关联了其他公司的路径。
  if (!scope.visibleUserIds.includes(input.path.split("/", 1)[0])) return false;
  const detail = await deps.loadAdminContentVideoDetail({
    supabase,
    scope,
    videoId: input.videoId,
    lifecycleState: "active",
  });
  if (!detail || detail.video.id !== input.videoId) return false;

  return resolveReviewScreenshots(detail.snapshot).some(
    (screenshot) => parseSubmissionScreenshotPath(screenshot.url) === input.path,
  );
}
