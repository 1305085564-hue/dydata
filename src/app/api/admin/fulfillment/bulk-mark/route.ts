import { NextResponse } from "next/server";

import {
  parseBulkMarkPayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  unwrapRpc,
  buildAbsenceNotification,
} from "../_shared";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { emit } from "@/lib/notifications/server";
import { toStringErrorResponse } from "@/lib/errors";

type BulkMarkDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
  requireActiveVisibleUsers: typeof requireActiveVisibleUsers;
  emit?: typeof emit;
};

export const defaultFulfillmentBulkMarkDeps: BulkMarkDeps = {
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
};

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

export async function buildFulfillmentBulkMarkResponse(
  input: unknown,
  deps: BulkMarkDeps = defaultFulfillmentBulkMarkDeps,
  observation?: MutationObservation,
  layers?: MutationLayers,
) {
  const payload = parseBulkMarkPayload(input);
  if ("response" in payload) return payload.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  observation?.mark("auth");
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  observation?.mark("scope");
  const scoped = deps.requireActiveVisibleUsers(auth, payload.data.userIds);
  if (scoped) return scoped;

  observation?.mark("review-rpc");
  let unwrapped: ReturnType<typeof unwrapRpc<unknown>>;
  try {
    const result = await auth.supabase.rpc("mark_fulfillment_status_batch", {
      p_user_ids: payload.data.userIds,
      p_record_date: payload.data.recordDate,
      p_status: payload.data.status,
      p_reason: payload.data.reason,
      p_marker_id: auth.actor.userId,
    });
    unwrapped = unwrapRpc<unknown>(result, "批量标记发布管理状态失败", {
      route: "/api/admin/fulfillment/bulk-mark",
      operation: "bulk-mark-fulfillment-status",
      requestId: observation?.requestId,
    });
  } catch (error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/bulk-mark",
      operation: "bulk-mark-fulfillment-status",
      requestId: observation?.requestId,
      status: 500,
      message: "批量标记发布管理状态失败",
      error,
    });
  }
  if ("response" in unwrapped) return unwrapped.response;

  if (layers) {
    layers.businessSucceeded = true;
    layers.auditStatus = "succeeded";
  }
  if (payload.data.status === "absent") {
    const notification = await (deps.emit ?? emit)({
      recipients: payload.data.userIds,
      type: "fulfillment.absent",
      category: "todo",
      severity: "warning",
      ...buildAbsenceNotification({
        recordDate: payload.data.recordDate,
        reason: payload.data.reason,
        markerName: auth.actor.name,
      }),
      actionLabel: "打开工作台",
      actionUrl: "/dashboard",
      sourceType: "fulfillment_absent",
      sourceId: `batch:${payload.data.recordDate}:${payload.data.userIds.slice().sort().join(",")}`,
      payload: { recordDate: payload.data.recordDate, reason: payload.data.reason },
    });
    if (layers) layers.employeeNotificationStatus = notification.ok ? "succeeded" : "failed";
    if (!notification.ok) {
      observation?.mark("compensate");
      if (layers) observation?.setDetail?.(layers);
      return NextResponse.json({ error: "缺勤已标记，但员工通知发送失败，请联系管理员", businessSucceeded: true }, { status: 500 });
    }
  }
  observation?.mark("finalize");
  return NextResponse.json(unwrapped.data ?? { ok: true });
}

async function handlePost(request: Request, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  return buildFulfillmentBulkMarkResponse(body.data, defaultFulfillmentBulkMarkDeps, observation, layers);
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/bulk-mark", request, async (observation) => {
    const layers: MutationLayers = {
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    };
    observation.setDetail?.(layers);
    const response = await handlePost(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
