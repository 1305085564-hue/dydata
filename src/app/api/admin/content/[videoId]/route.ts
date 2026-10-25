import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminContentVideoDetail } from "@/lib/loaders/content-detail";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DetailDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  resolveVideoReviewReadOnlyScope: typeof resolveVideoReviewReadOnlyScope;
  createAdminClient: typeof createAdminClient;
  loadAdminContentVideoDetail: typeof loadAdminContentVideoDetail;
};

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

const defaultDependencies: DetailDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  resolveVideoReviewReadOnlyScope,
  createAdminClient,
  loadAdminContentVideoDetail,
};

export async function buildAdminContentDetailResponse(
  request: NextRequest,
  videoId: string,
  deps: DetailDependencies = defaultDependencies,
) {
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return jsonNoStore({ error: auth.error }, auth.status);
  if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return jsonNoStore({ error: "无权限" }, 403);
  }
  const permissionContext = auth.context ?? await deps.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) return jsonNoStore({ error: "用户权限范围加载失败" }, 403);
  const view = request.nextUrl.searchParams.get("view") === "trash" ? "trashed" : "active";
  if (view === "trashed" && auth.actor.permissions.manage_videos !== true) {
    return jsonNoStore({ error: "无回收站查看权限" }, 403);
  }
  const client = deps.createAdminClient() as SupabaseClient;
  const scope = await deps.resolveVideoReviewReadOnlyScope(client, permissionContext.scope);
  const detail = await deps.loadAdminContentVideoDetail({
    supabase: client,
    scope,
    videoId,
    lifecycleState: view,
  });
  if (!detail) return jsonNoStore({ error: "视频不存在" }, 404);
  return jsonNoStore(detail);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  return buildAdminContentDetailResponse(request, videoId);
}
