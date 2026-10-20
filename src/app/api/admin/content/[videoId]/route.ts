import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminContentVideoDetail } from "@/lib/loaders/content-detail";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DetailDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  resolveReadOnlyCompanyScope: typeof resolveReadOnlyCompanyScope;
  createAdminClient: typeof createAdminClient;
  loadAdminContentVideoDetail: typeof loadAdminContentVideoDetail;
};

const defaultDependencies: DetailDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  resolveReadOnlyCompanyScope,
  createAdminClient,
  loadAdminContentVideoDetail,
};

export async function buildAdminContentDetailResponse(
  request: NextRequest,
  videoId: string,
  deps: DetailDependencies = defaultDependencies,
) {
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const permissionContext = auth.context ?? await deps.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  const view = request.nextUrl.searchParams.get("view") === "trash" ? "trashed" : "active";
  if (view === "trashed" && auth.actor.permissions.manage_videos !== true) {
    return NextResponse.json({ error: "无回收站查看权限" }, { status: 403 });
  }
  const client = deps.createAdminClient() as SupabaseClient;
  const scope = await deps.resolveReadOnlyCompanyScope(client, permissionContext.scope);
  const detail = await deps.loadAdminContentVideoDetail({
    supabase: client,
    scope,
    videoId,
    lifecycleState: view,
  });
  if (!detail) return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "private, max-age=60" } });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  return buildAdminContentDetailResponse(request, videoId);
}
