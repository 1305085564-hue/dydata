import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicMessageForCode } from "@/lib/errors";
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

async function handlePost(request: NextRequest, observation: MutationObservation, layers: MutationLayers) {
  observation.mark("auth");
  const supabase = await createClient();
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

  const admin = createAdminClient();
  observation.mark("read");
  observation.mark("write-video");
  const result = await resumeAppealSubmission(appealId, admin, {
    getBaseUrl: () => new URL(request.url).origin,
    markWriteRequest: () => observation.mark("write-request"),
  }, user.id);
  if (!result.success) {
    const status = result.error === "补交申请不存在" ? 404
      : result.error === "补交申请尚未通过" || result.error === "没有找到待续交的数据" ? 409
        : 500;
    const error = result.error === "补交申请不存在" ? publicMessageForCode("APPEAL_NOT_FOUND")
      : result.error === "没有找到待续交的数据" ? "没有找到待续交的数据，请回到填报页重新提交"
        : result.error;
    return NextResponse.json({ error }, { status });
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
    const response = await handlePost(request, observation, layers);
    observation.setDetail?.(layers);
    return appendObservedMutationResult(response, observation);
  });
}
