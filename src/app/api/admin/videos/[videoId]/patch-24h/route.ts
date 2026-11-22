import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActor, type AdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/lib/api-path-validation";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { AppError } from "@/lib/errors";
import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";
import { createClient } from "@/lib/supabase/server";
import {
  build24hSnapshotPayload,
  build24hSnapshotUpdatePatch,
  parsePatch24hMetrics,
  type Patch24hMetricsFormState,
} from "@/lib/video-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PermissionContext = NonNullable<Awaited<ReturnType<typeof buildPermissionContextForActor>>>;
type UserSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type Patch24hDependencies = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  createClient: () => Promise<UserSupabaseClient>;
};

const defaultDependencies: Patch24hDependencies = {
  requireAdminActor,
  buildPermissionContextForActor,
  createClient,
};

const metricInputSchema = z.union([
  z.string().refine((value) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric >= 0;
  }, "指标必须是非负数字"),
  z.number().finite().min(0, "指标不能为负数"),
  z.null(),
]).optional();

const metricsSchema = z.object({
  play_count: metricInputSchema,
  likes: metricInputSchema,
  comments: metricInputSchema,
  shares: metricInputSchema,
  favorites: metricInputSchema,
  follower_gain: metricInputSchema,
  follower_loss: metricInputSchema,
  follower_convert: metricInputSchema,
  avg_play_ratio: metricInputSchema,
});

const patch24hBodySchema = z.object({
  snapshotId: z.string().regex(UUID_PATTERN, "snapshotId 必须是合法 UUID").nullable().optional(),
  metrics: metricsSchema,
});

function toFormState(metrics: z.infer<typeof metricsSchema>): Patch24hMetricsFormState {
  const normalize = (value: string | number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return {
    play_count: normalize(metrics.play_count),
    likes: normalize(metrics.likes),
    comments: normalize(metrics.comments),
    shares: normalize(metrics.shares),
    favorites: normalize(metrics.favorites),
    follower_gain: normalize(metrics.follower_gain),
    follower_loss: normalize(metrics.follower_loss),
    follower_convert: normalize(metrics.follower_convert),
    avg_play_ratio: normalize(metrics.avg_play_ratio),
  };
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
  const allowedUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  return allowedUserIds.includes(ownerUserId) && actor.membershipStatus !== "archived";
}

function appErrorResponse(error: AppError, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    ok: false,
    code: error.code,
    error: error.publicMessage,
    ...extra,
  }, { status: error.status });
}

export async function buildPatch24hResponse(
  request: NextRequest,
  videoId: string,
  deps: Patch24hDependencies = defaultDependencies,
  observation?: MutationObservation,
) {
  observation?.mark("validate");
  const normalizedVideoId = videoId.trim();
  if (!UUID_PATTERN.test(normalizedVideoId)) {
    return appErrorResponse(new AppError({
      code: "INVALID_INPUT",
      message: "invalid videoId",
      publicMessage: "videoId 必须是合法 UUID",
      operation: "patch_24h",
      targetId: normalizedVideoId,
    }));
  }

  observation?.mark("auth");
  const auth = await deps.requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return appErrorResponse(new AppError({
      code: auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      message: auth.error,
      publicMessage: auth.error,
      status: auth.status,
      operation: "patch_24h",
      targetId: normalizedVideoId,
    }));
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return appErrorResponse(new AppError({
      code: "INVALID_INPUT",
      message: "invalid json",
      publicMessage: "请求正文不是有效 JSON",
      operation: "patch_24h",
      targetId: normalizedVideoId,
    }));
  }

  const parsedBody = patch24hBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    const issueMessage = parsedBody.error.issues[0]?.message ?? "请求参数不正确";
    return appErrorResponse(new AppError({
      code: "INVALID_INPUT",
      message: parsedBody.error.message,
      publicMessage: issueMessage,
      operation: "patch_24h",
      targetId: normalizedVideoId,
    }));
  }

  observation?.mark("scope");
  const permissionContext = auth.context ?? await deps.buildPermissionContextForActor(auth.actor);
  if (!permissionContext) {
    return appErrorResponse(new AppError({
      code: "FORBIDDEN",
      message: "permission context unavailable",
      publicMessage: "用户权限范围加载失败",
      operation: "patch_24h",
      targetId: normalizedVideoId,
    }));
  }

  observation?.mark("read");
  const userSupabase = await deps.createClient();
  const videoResult = await userSupabase
    .from("videos")
    .select("id, user_id, anomaly_status, accounts(profile_id)")
    .eq("id", normalizedVideoId)
    .eq("lifecycle_state", "active")
    .maybeSingle();

  if (videoResult.error) {
    return appErrorResponse(new AppError({
      code: "DEPENDENCY_FAILED",
      status: 500,
      message: videoResult.error.message,
      publicMessage: "加载视频失败，请稍后重试",
      operation: "patch_24h_load_video",
      targetId: normalizedVideoId,
      cause: videoResult.error,
    }));
  }
  if (!videoResult.data) {
    return appErrorResponse(new AppError({
      code: "NOT_FOUND",
      message: "video not found",
      publicMessage: "视频不存在或已移入回收站",
      operation: "patch_24h_load_video",
      targetId: normalizedVideoId,
    }));
  }
  if (!isActorAllowedForVideo(
    auth.actor,
    permissionContext.scope,
    videoResult.data as { user_id: string; accounts: unknown },
  )) {
    return appErrorResponse(new AppError({
      code: "FORBIDDEN",
      message: "video out of scope",
      publicMessage: "无权限修改该视频",
      operation: "patch_24h_scope",
      targetId: normalizedVideoId,
    }));
  }

  const metrics = parsePatch24hMetrics(toFormState(parsedBody.data.metrics));
  const snapshotPayload = build24hSnapshotPayload(normalizedVideoId, metrics, null);
  const snapshotUpdatePatch = build24hSnapshotUpdatePatch(metrics);

  observation?.mark("write-snapshot");
  const snapshotResult = parsedBody.data.snapshotId
    ? await userSupabase
        .from("video_metrics_snapshots")
        .update(snapshotUpdatePatch)
        .eq("id", parsedBody.data.snapshotId)
        .eq("video_id", normalizedVideoId)
        .select("*")
        .maybeSingle()
    : await userSupabase
        .from("video_metrics_snapshots")
        .insert(snapshotPayload)
        .select("*")
        .maybeSingle();

  if (snapshotResult.error) {
    return appErrorResponse(new AppError({
      code: "DEPENDENCY_FAILED",
      status: 500,
      message: snapshotResult.error.message,
      publicMessage: "24h 数据保存失败，请稍后重试",
      operation: "patch_24h_write_snapshot",
      targetId: normalizedVideoId,
      cause: snapshotResult.error,
    }), {
      partialSuccess: false,
      snapshotSaved: false,
      statusUpdated: false,
    });
  }
  if (!snapshotResult.data) {
    return appErrorResponse(new AppError({
      code: "NOT_FOUND",
      message: "snapshot not found",
      publicMessage: "未找到可更新的 24h 快照，请刷新重试",
      operation: "patch_24h_write_snapshot",
      targetId: normalizedVideoId,
    }), {
      partialSuccess: false,
      snapshotSaved: false,
      statusUpdated: false,
    });
  }

  const currentAnomalyStatus = (videoResult.data as { anomaly_status?: string | null }).anomaly_status ?? null;
  let nextAnomalyStatus = currentAnomalyStatus;
  let statusUpdated = false;

  if (currentAnomalyStatus === "未满24h") {
    observation?.mark("write-video");
    const videoUpdateResult = await userSupabase
      .from("videos")
      .update({ anomaly_status: "正常" })
      .eq("id", normalizedVideoId)
      .eq("lifecycle_state", "active")
      .select("id, anomaly_status")
      .maybeSingle();

    if (videoUpdateResult.error || !videoUpdateResult.data) {
      return appErrorResponse(new AppError({
        code: "PATCH_24H_STATUS_UPDATE_FAILED",
        message: videoUpdateResult.error?.message || "video anomaly_status update returned empty row",
        operation: "patch_24h_write_video",
        targetId: normalizedVideoId,
        cause: videoUpdateResult.error,
      }), {
        businessSucceeded: false,
        partialSuccess: true,
        snapshotSaved: true,
        statusUpdated: false,
        snapshot: snapshotResult.data,
      });
    }

    nextAnomalyStatus = (videoUpdateResult.data as { anomaly_status?: string | null }).anomaly_status ?? "正常";
    statusUpdated = true;
  }

  return NextResponse.json({
    ok: true,
    partialSuccess: false,
    snapshotSaved: true,
    statusUpdated,
    video: {
      id: normalizedVideoId,
      anomaly_status: nextAnomalyStatus,
    },
    snapshot: snapshotResult.data,
  });
}

export const defaultPatch24hRouteDeps = { buildPatch24hResponse };

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  return observeMutation("/api/admin/videos/[videoId]/patch-24h", async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    const response = await defaultPatch24hRouteDeps.buildPatch24hResponse(request, videoId, defaultDependencies, observation);
    return appendObservedMutationResult(response, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
