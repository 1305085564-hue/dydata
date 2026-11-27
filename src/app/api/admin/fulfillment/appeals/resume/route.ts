import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicMessageForCode, toStringErrorResponse } from "@/lib/errors";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { resumeAppealSubmission } from "../../appeal/_resume-submission";

type LayerStatus = "succeeded" | "failed" | "skipped";
type MutationLayers = {
  businessSucceeded: boolean;
  auditStatus: LayerStatus;
  employeeNotificationStatus: LayerStatus;
  todoStatus: LayerStatus;
};

export type ResumeFulfillmentAppealDeps = {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  resumeAppealSubmission: typeof resumeAppealSubmission;
};

export async function handleResumeFulfillmentAppealPost(
  request: NextRequest,
  observation: MutationObservation,
  layers: MutationLayers,
  deps: ResumeFulfillmentAppealDeps = { createClient, createAdminClient, resumeAppealSubmission },
) {
  observation.mark("auth");
  const supabase = await deps.createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  observation.mark("validate");
  let body: { appealId?: unknown };
  try {
    body = (await request.json()) as { appealId?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const appealId = typeof body.appealId === "string" ? body.appealId.trim() : "";
  if (!appealId) return NextResponse.json({ error: "缺少补交申请编号" }, { status: 400 });

  const admin = deps.createAdminClient();
  observation.mark("read");
  observation.mark("write-video");
  const result = await deps.resumeAppealSubmission(appealId, admin, {
    getBaseUrl: () => new URL(request.url).origin,
    markWriteRequest: () => observation.mark("write-request"),
  }, user.id);
  if (!result.success) {
    if (result.error === "补交申请不存在") {
      return NextResponse.json({ error: publicMessageForCode("APPEAL_NOT_FOUND") }, { status: 404 });
    }
    if (result.error === "补交申请尚未通过") {
      return NextResponse.json({ error: "补交申请尚未通过" }, { status: 409 });
    }
    if (result.error === "没有找到待续交的数据") {
      return NextResponse.json({ error: "没有找到待续交的数据，请回到填报页重新提交" }, { status: 409 });
    }
    return toStringErrorResponse({
      code: "INTERNAL_ERROR",
      route: "/api/admin/fulfillment/appeals/resume",
      operation: "resume-appeal-submission",
      request,
      requestId: observation.requestId,
      error: result.error,
      status: 500,
      message: "补交数据续交失败，请回到填报页重试",
    });
  }
  layers.businessSucceeded = true;

  observation.mark("finalize");
  return NextResponse.json({ ok: true, resumed: true, videoId: result.videoId, cleared: result.cleared });
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/fulfillment/appeals/resume", request, async (observation) => {
    const layers: MutationLayers = {
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
    };
    observation.setDetail?.(layers);
    const response = await handleResumeFulfillmentAppealPost(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
