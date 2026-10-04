import { NextResponse } from "next/server";
import { buildWriterCertificationResponse } from "./route-core";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

export async function POST(request: Request) {
  return observeMutation("/api/admin/collaboration/writer-certification", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return appendObservedMutationResult(
        NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 }),
        observation,
      );
    }
    const response = await buildWriterCertificationResponse(body);
    return appendObservedMutationResult(response, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
