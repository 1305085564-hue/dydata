import { NextResponse } from "next/server";
import { buildWriterCertificationResponse } from "./route-core";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

type WriterCertificationRouteDeps = {
  buildWriterCertificationResponse: typeof buildWriterCertificationResponse;
};

export const defaultWriterCertificationRouteDeps: WriterCertificationRouteDeps = { buildWriterCertificationResponse };

export async function buildWriterCertificationRouteResponse(
  request: Request,
  deps: WriterCertificationRouteDeps = defaultWriterCertificationRouteDeps,
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return appendObservedMutationResult(
      NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 }),
      observation,
    );
  }
  try {
    return appendObservedMutationResult(await deps.buildWriterCertificationResponse(body), observation);
  } catch (error) {
    return appendObservedMutationResult(
      new Response(JSON.stringify({ error: error instanceof Error ? error.message : "保存文案认证失败" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
      observation,
    );
  }
}

export async function POST(request: Request) {
  return observeMutation("/api/admin/collaboration/writer-certification", async (observation) => {
    return buildWriterCertificationRouteResponse(request, defaultWriterCertificationRouteDeps, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
