import { buildAttributionResponse } from "../handlers";
import { toStringErrorResponse } from "@/lib/errors";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

type AttributionRouteDeps = {
  buildAttributionResponse: typeof buildAttributionResponse;
};

export const defaultAttributionRouteDeps: AttributionRouteDeps = { buildAttributionResponse };

export async function buildAttributionRouteResponse(
  request: Request,
  deps: AttributionRouteDeps = defaultAttributionRouteDeps,
  observation?: Parameters<Parameters<typeof observeMutation>[1]>[0],
) {
  observation?.mark("validate");
  observation?.setDetail?.({
    businessSucceeded: false,
    auditStatus: "skipped",
    employeeNotificationStatus: "skipped",
    todoStatus: "skipped",
    compensationRequired: false,
    events: [],
  });
  try {
    const response = await deps.buildAttributionResponse(request);
    return appendObservedMutationResult(response, observation);
  } catch (error) {
    return appendObservedMutationResult(
      toStringErrorResponse({
        code: "INTERNAL_ERROR",
        route: "/api/admin/collaboration/attribution",
        operation: "update-attribution",
        request,
        requestId: observation?.requestId,
        status: 500,
        message: "更新岗位归属失败",
        error,
        extraFields: { ok: false },
      }),
      observation,
    );
  }
}

export async function PATCH(request: Request) {
  return observeMutation("/api/admin/collaboration/attribution", async (observation) => {
    return buildAttributionRouteResponse(request, defaultAttributionRouteDeps, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
