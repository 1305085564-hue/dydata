import { NextResponse } from "next/server";

import {
  parseRemovePayload,
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireActiveVisibleUsers,
  unwrapRpc,
} from "../_shared";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { toStringErrorResponse } from "@/lib/errors";

type RemoveDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
  requireActiveVisibleUsers: typeof requireActiveVisibleUsers;
};

export const defaultFulfillmentRemoveDeps: RemoveDeps = {
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

export async function buildFulfillmentRemoveResponse(
  input: unknown,
  deps: RemoveDeps = defaultFulfillmentRemoveDeps,
  observation?: MutationObservation,
  layers?: MutationLayers,
) {
  const payload = parseRemovePayload(input);
  if ("response" in payload) return payload.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  observation?.mark("auth");
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  observation?.mark("scope");
  const scoped = deps.requireActiveVisibleUsers(auth, [payload.data.userId]);
  if (scoped) return scoped;

  observation?.mark("review-rpc");
  let unwrapped: ReturnType<typeof unwrapRpc<unknown>>;
  try {
    const result = await auth.supabase.rpc("remove_fulfillment_mark", {
      p_user_id: payload.data.userId,
      p_record_date: payload.data.recordDate,
      p_marker_id: auth.actor.userId,
    });
    unwrapped = unwrapRpc<unknown>(result, "删除发布管理标记失败", {
      route: "/api/admin/fulfillment/remove",
      operation: "remove-fulfillment-mark",
      requestId: observation?.requestId,
    });
  } catch (error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/fulfillment/remove",
      operation: "remove-fulfillment-mark",
      requestId: observation?.requestId,
      status: 500,
      message: "删除发布管理标记失败",
      error,
    });
  }
  if ("response" in unwrapped) return unwrapped.response;

  if (layers) {
    layers.businessSucceeded = true;
    layers.auditStatus = "succeeded";
  }
  observation?.mark("finalize");
  return NextResponse.json(unwrapped.data ?? { ok: true });
}

async function handlePost(request: Request, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });

  return buildFulfillmentRemoveResponse(body.data, defaultFulfillmentRemoveDeps, observation, layers);
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/admin/fulfillment/remove", request, async (observation) => {
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
