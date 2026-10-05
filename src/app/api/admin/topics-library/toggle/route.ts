import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { toggleTopicLibrary, type TopicLibraryToggleAction } from "@/lib/topics/library";
import { isUuidLike } from "@/lib/topics/domain";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToggleRouteDependencies = {
  requireActor?: typeof requireAdminActor;
  createAdmin?: typeof createAdminClient;
  toggle?: typeof toggleTopicLibrary;
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

export async function handleTopicsLibraryToggle(
  request: NextRequest,
  dependencies: ToggleRouteDependencies = {},
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
  if (!body || typeof body !== "object") {
    return mutationResponse({ error: "请求体格式不正确" }, 400, observation, { businessSucceeded: false });
  }

  const subTopicId = typeof (body as { subTopicId?: unknown }).subTopicId === "string"
    ? (body as { subTopicId: string }).subTopicId
    : "";
  const action = (body as { action?: unknown }).action;
  if (!isUuidLike(subTopicId)) {
    return mutationResponse({ error: "选题 ID 格式不正确" }, 400, observation, { businessSucceeded: false });
  }
  if (action !== "remove" && action !== "restore") {
    return mutationResponse({ error: "action 只能是 remove 或 restore" }, 400, observation, { businessSucceeded: false });
  }

  const admin = (dependencies.createAdmin ?? createAdminClient)();
  observation?.mark("scope");
  const scope = auth.context?.scope
    ?? await (dependencies.buildScope ?? buildDataAccessScope)(admin, auth.actor.userId);
  if (!scope) return mutationResponse({ error: "用户权限范围加载失败" }, 403, observation, { businessSucceeded: false });
  observation?.mark("read");
  const { data: target, error: targetError } = await admin
    .from("sub_topics")
    .select("created_by")
    .eq("id", subTopicId)
    .maybeSingle();
  if (targetError) return mutationResponse({ error: "查询选题失败" }, 500, observation, { businessSucceeded: false });
  if (!target) return mutationResponse({ error: "选题不存在" }, 404, observation, { businessSucceeded: false });
  const creatorId = (target as { created_by: string }).created_by;
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  if (!activeVisibleUserIds.includes(creatorId)) {
    return mutationResponse({ error: "无权管理当前范围外的选题" }, 403, observation, { businessSucceeded: false });
  }

  observation?.mark("write-request");
  const result = await (dependencies.toggle ?? toggleTopicLibrary)(admin, {
    subTopicId,
    action: action as TopicLibraryToggleAction,
    actorId: auth.actor.userId,
  });
  if (!result.ok) {
    const auditStatus: SideEffectStatus = /审计|回滚/.test(result.message) ? "failed" : "skipped";
    return mutationResponse(
      { error: result.message },
      result.status,
      observation,
      {
        businessSucceeded: false,
        auditStatus,
        events: auditStatus === "failed"
          ? ["topics_library.toggle.audit_failed"]
          : ["topics_library.toggle.failed"],
      },
    );
  }
  observation?.mark("finalize");
  return mutationResponse(
    { ok: true, topic: result.value },
    200,
    observation,
    {
      businessSucceeded: true,
      auditStatus: "succeeded",
      businessStatus: action as string,
      events: ["topics_library.toggle.succeeded"],
    },
  );
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/topics-library/toggle", request, async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      permissionChecked: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return appendObservedMutationResult(await handleTopicsLibraryToggle(request, {}, observation), observation);
  });
}
