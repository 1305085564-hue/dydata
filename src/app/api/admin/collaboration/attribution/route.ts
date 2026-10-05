import { buildAttributionResponse } from "../handlers";
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
      new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "更新岗位归属失败" }), {
        status: 500,
        headers: { "content-type": "application/json" },
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
