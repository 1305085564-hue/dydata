import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { ensureInternalLibraryEntry } from "@/lib/topics/library";
import { isUuidLike } from "@/lib/topics/domain";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvaluateRouteDependencies = {
  requireActor?: typeof requireAdminActor;
  createAdmin?: typeof createAdminClient;
  ensureEntry?: typeof ensureInternalLibraryEntry;
  buildScope?: typeof buildDataAccessScope;
};

type SideEffectStatus = "succeeded" | "failed" | "skipped";

function statusBoolean(status: SideEffectStatus) {
  return status === "succeeded" ? true : status === "failed" ? false : null;
}

function mutationFields(input: {
  businessSucceeded: boolean;
  auditStatus?: SideEffectStatus;
  employeeNotificationStatus?: SideEffectStatus;
  todoStatus?: SideEffectStatus;
  compensationRequired?: boolean;
}) {
  const auditStatus = input.auditStatus ?? "skipped";
  const employeeNotificationStatus = input.employeeNotificationStatus ?? "skipped";
  const todoStatus = input.todoStatus ?? "skipped";
  const compensationRequired = input.compensationRequired
    ?? [auditStatus, employeeNotificationStatus, todoStatus].includes("failed");
  return {
    businessSucceeded: input.businessSucceeded,
    auditSucceeded: statusBoolean(auditStatus),
    notificationSucceeded: statusBoolean(employeeNotificationStatus),
    todoMarked: statusBoolean(todoStatus),
    compensationRequired,
    auditStatus,
    employeeNotificationStatus,
    todoStatus,
    employeeNotificationSucceeded: statusBoolean(employeeNotificationStatus),
    notificationMarked: statusBoolean(todoStatus),
  };
}

function mutationResponse(
  body: Record<string, unknown>,
  status: number,
  observation: MutationObservation | undefined,
  input: Parameters<typeof mutationFields>[0] & { businessStatus?: string | null; events?: string[] },
) {
  const fields = mutationFields(input);
  const permissionChecked = status !== 401 && status !== 403;
  observation?.setDetail?.({
    ...fields,
    permissionChecked,
    businessStatus: input.businessStatus ?? null,
    events: input.events ?? [],
  });
  return NextResponse.json(
    { ...body, ...fields, permissionChecked, businessStatus: input.businessStatus ?? null, events: input.events ?? [] },
    { status },
  );
}

export async function handleTopicsLibraryEvaluate(
  request: NextRequest,
  dependencies: EvaluateRouteDependencies = {},
  observation?: MutationObservation,
) {
  observation?.mark("auth");
  const auth = await (dependencies.requireActor ?? requireAdminActor)({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return mutationResponse({ error: auth.error }, auth.status, observation, { businessSucceeded: false });
  }
  observation?.setDetail?.({ permissionChecked: true });

  observation?.mark("validate");
  const body = await request.json().catch(() => null);
  const videoId = typeof (body as { videoId?: unknown } | null)?.videoId === "string"
    ? (body as { videoId: string }).videoId
    : "";
  if (!isUuidLike(videoId)) {
    return mutationResponse({ error: "视频 ID 格式不正确" }, 400, observation, { businessSucceeded: false });
  }

  try {
    const admin = (dependencies.createAdmin ?? createAdminClient)();
    observation?.mark("scope");
    const scope = auth.context?.scope
      ?? await (dependencies.buildScope ?? buildDataAccessScope)(admin, auth.actor.userId);
    if (!scope) return mutationResponse({ error: "用户权限范围加载失败" }, 403, observation, { businessSucceeded: false });
    observation?.mark("read");
    const { data: video, error: videoError } = await admin
      .from("videos")
      .select("user_id, accounts(profile_id)")
      .eq("id", videoId)
      .maybeSingle();
    if (videoError) return mutationResponse({ error: "查询视频失败" }, 500, observation, { businessSucceeded: false });
    if (!video) return mutationResponse({ error: "视频不存在" }, 404, observation, { businessSucceeded: false });
    const joinedAccount = (video as { accounts?: { profile_id?: string | null } | Array<{ profile_id?: string | null }> | null }).accounts;
    const ownerId = (Array.isArray(joinedAccount) ? joinedAccount[0]?.profile_id : joinedAccount?.profile_id)
      ?? (video as { user_id: string }).user_id;
    const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
    if (!activeVisibleUserIds.includes(ownerId)) {
      return mutationResponse({ error: "无权评估当前范围外的视频" }, 403, observation, { businessSucceeded: false });
    }
    observation?.mark("scope");
    const { data: owner, error: ownerError } = await admin
      .from("profiles")
      .select("team_id")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError) return mutationResponse({ error: "查询视频所属团队失败" }, 500, observation, { businessSucceeded: false });
    const ownerTeamId = (owner as { team_id?: string | null } | null)?.team_id ?? null;
    if (!ownerTeamId) return mutationResponse({ error: "视频负责人未归属团队" }, 403, observation, { businessSucceeded: false });
    observation?.mark("write-request");
    const result = await (dependencies.ensureEntry ?? ensureInternalLibraryEntry)(admin, videoId, ownerTeamId);
    observation?.mark("finalize");
    return mutationResponse(
      { ok: true, entry: result },
      200,
      observation,
      {
        businessSucceeded: true,
        businessStatus: result.outcome,
        events: [`topics_library.evaluate.${result.outcome}`],
      },
    );
  } catch (error) {
    console.error("[topics-library] evaluate failed", error);
    return mutationResponse(
      { error: error instanceof Error ? error.message : "评估入库失败" },
      500,
      observation,
      { businessSucceeded: false, events: ["topics_library.evaluate.failed"] },
    );
  }
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/topics-library/evaluate", request, async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      permissionChecked: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return appendObservedMutationResult(await handleTopicsLibraryEvaluate(request, {}, observation), observation);
  });
}
