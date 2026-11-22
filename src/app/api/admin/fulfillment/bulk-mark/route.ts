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

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

async function handlePost(request: Request, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  const payload = parseBulkMarkPayload(body.data);
  if ("response" in payload) return payload.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  observation.mark("auth");
  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  observation.mark("scope");
  const scoped = requireActiveVisibleUsers(auth, payload.data.userIds);
  if (scoped) return scoped;

  observation.mark("review-rpc");
  const result = await auth.supabase.rpc("mark_fulfillment_status_batch", {
    p_user_ids: payload.data.userIds,
    p_record_date: payload.data.recordDate,
    p_status: payload.data.status,
    p_reason: payload.data.reason,
    p_marker_id: auth.actor.userId,
  });
  const unwrapped = unwrapRpc<unknown>(result, "批量标记发布管理状态失败");
  if ("response" in unwrapped) return unwrapped.response ?? NextResponse.json({ error: "批量标记发布管理状态失败" }, { status: 500 });

  layers.businessSucceeded = true;
  layers.auditStatus = "succeeded";
  if (payload.data.status === "absent") {
    const notification = await emit({
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
    layers.employeeNotificationStatus = notification.ok ? "succeeded" : "failed";
    if (!notification.ok) {
      observation.mark("compensate");
      observation.setDetail?.(layers);
      return NextResponse.json({ error: "缺勤已标记，但员工通知发送失败，请联系管理员", businessSucceeded: true }, { status: 500 });
    }
  }
  observation.mark("finalize");
  return NextResponse.json(unwrapped.data ?? { ok: true });
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
