import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor, type AdminActor } from "@/app/api/admin/auth-helper";
import { clearAdminContentListCache } from "@/app/api/admin/content/list/route";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewStatus = "pending" | "reviewed";
type PermissionContext = NonNullable<Awaited<ReturnType<typeof buildPermissionContextForActor>>>;

type ReviewStatusDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  createAdminClient: () => SupabaseClient;
  now: () => Date;
  clearAdminContentListCache: () => void;
};

const defaultDependencies: ReviewStatusDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  createAdminClient,
  now: () => new Date(),
  clearAdminContentListCache,
};

type ReviewStatusInput = {
  status: ReviewStatus;
  reviewedAt: string | null;
};

function parseReviewStatusInput(input: unknown, now: () => Date): ReviewStatusInput | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "请求正文必须是对象" };
  }

  const status = "status" in input ? input.status : undefined;
  if (status !== "pending" && status !== "reviewed") {
    return { error: "status 只能是 pending 或 reviewed" };
  }

  if (status === "pending") {
    return { status, reviewedAt: null };
  }

  const reviewedAtInput = "reviewed_at" in input ? input.reviewed_at : undefined;
  if (reviewedAtInput === undefined) {
    return { status, reviewedAt: now().toISOString() };
  }
  if (typeof reviewedAtInput !== "string" || !reviewedAtInput.trim()) {
    return { error: "reviewed_at 必须是有效时间字符串" };
  }

  const reviewedAt = new Date(reviewedAtInput);
  if (Number.isNaN(reviewedAt.getTime())) {
    return { error: "reviewed_at 必须是有效时间字符串" };
  }
  return { status, reviewedAt: reviewedAt.toISOString() };
}

function firstJoinedAccount(value: unknown): { profile_id?: string | null } | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as { profile_id?: string | null } : null;
}

function isActorAllowedForVideo(
  actor: AdminActor,
  scope: PermissionContext["scope"],
  video: { user_id: string; accounts: unknown },
) {
  const ownerUserId = firstJoinedAccount(video.accounts)?.profile_id ?? video.user_id;
  if (scope.kind === "all") return true;
  const allowedUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  return allowedUserIds.includes(ownerUserId) && actor.membershipStatus !== "archived";
}

export async function buildVideoReviewStatusResponse(
  request: NextRequest,
  videoId: string,
  deps: ReviewStatusDependencies = defaultDependencies,
) {
  const normalizedVideoId = videoId.trim();
  if (!UUID_PATTERN.test(normalizedVideoId)) {
    return NextResponse.json({ error: "videoId 必须是合法 UUID" }, { status: 400 });
  }

  const auth = await deps.requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求正文不是有效 JSON" }, { status: 400 });
  }

  const parsed = parseReviewStatusInput(payload, deps.now);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const permissionContext = await deps.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const adminSupabase = deps.createAdminClient();
  const videoResult = await adminSupabase
    .from("videos")
    .select("id, user_id, accounts(profile_id)")
    .eq("id", normalizedVideoId)
    .eq("lifecycle_state", "active")
    .maybeSingle();

  if (videoResult.error) {
    console.error("[admin-content] load video for review status failed", videoResult.error);
    return NextResponse.json({ error: "加载视频失败" }, { status: 500 });
  }
  if (!videoResult.data) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }
  if (!isActorAllowedForVideo(
    auth.actor,
    permissionContext.scope,
    videoResult.data as { user_id: string; accounts: unknown },
  )) {
    return NextResponse.json({ error: "无权限修改该视频" }, { status: 403 });
  }

  const updatePayload = parsed.status === "reviewed"
    ? {
        review_status: parsed.status,
        reviewed_at: parsed.reviewedAt,
        reviewed_by: auth.actor.userId,
      }
    : {
        review_status: parsed.status,
        reviewed_at: null,
        reviewed_by: null,
      };
  const updatedResult = await adminSupabase
    .from("videos")
    .update(updatePayload)
    .eq("id", normalizedVideoId)
    .eq("lifecycle_state", "active")
    .select("id, review_status, reviewed_at")
    .maybeSingle();

  if (updatedResult.error) {
    console.error("[admin-content] update video review status failed", updatedResult.error);
    return NextResponse.json({ error: "更新复盘状态失败" }, { status: 500 });
  }
  if (!updatedResult.data) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }

  deps.clearAdminContentListCache();
  return NextResponse.json({ ok: true, video: updatedResult.data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  return buildVideoReviewStatusResponse(request, videoId);
}
