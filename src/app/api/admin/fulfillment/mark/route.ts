import { NextResponse } from "next/server";

import {
  parseMarkPayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  unwrapRpc,
  buildAbsenceNotification,
} from "../_shared";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { emit } from "@/lib/notifications/server";

type MarkDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
  requireActiveVisibleUsers: typeof requireActiveVisibleUsers;
  emit?: typeof emit;
};

export const defaultFulfillmentMarkDeps: MarkDeps = { requireAdminServiceClient, requireOwnerOrAdminRole, requireActiveVisibleUsers };

export async function buildFulfillmentMarkResponse(input: unknown, deps: MarkDeps = defaultFulfillmentMarkDeps) {
  const payload = parseMarkPayload(input);
  if ("response" in payload) return payload.response;
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  const scoped = deps.requireActiveVisibleUsers(auth, [payload.data.userId]);
  if (scoped) return scoped;
  try {
    const result = await auth.supabase.rpc("mark_fulfillment_status", {
      p_user_id: payload.data.userId,
      p_record_date: payload.data.recordDate,
      p_status: payload.data.status,
      p_reason: payload.data.reason,
      p_marker_id: auth.actor.userId,
    });
    const unwrapped = unwrapRpc<unknown>(result, "标记发布管理状态失败");
    if ("response" in unwrapped) return unwrapped.response ?? NextResponse.json({ error: "标记发布管理状态失败" }, { status: 500 });
    if (payload.data.status === "absent") {
      const notification = await (deps.emit ?? emit)({
        recipients: [payload.data.userId],
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
        sourceId: `${payload.data.userId}:${payload.data.recordDate}`,
        payload: { recordDate: payload.data.recordDate, reason: payload.data.reason },
      });
      if (!notification.ok) {
        return NextResponse.json({ error: "缺勤已标记，但员工通知发送失败，请联系管理员", businessSucceeded: true, employeeNotificationStatus: "failed" }, { status: 500 });
      }
    }
    // 只有真的发了缺勤通知才上报通知状态；标其它状态时不伪造 succeeded。
    return NextResponse.json(
      unwrapped.data ?? { ok: true, ...(payload.data.status === "absent" ? { employeeNotificationStatus: "succeeded" } : {}) },
    );
  } catch {
    return NextResponse.json({ error: "标记发布管理状态失败" }, { status: 500 });
  }
}

async function handlePost(request: Request, observation: MutationObservation) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  observation.mark("auth");
  const response = await buildFulfillmentMarkResponse(body.data);
  observation.mark("finalize");
  return response;
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/mark", request, async (observation) =>
    appendObservedMutationResult(await handlePost(request, observation), observation),
  );
}
