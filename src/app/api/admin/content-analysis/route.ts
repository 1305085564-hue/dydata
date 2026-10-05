import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  ContentAnalysisError,
  generateContentAnalysisForAccess,
} from "@/lib/content-analysis-service";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

type RequestBody = {
  video_id?: string;
};

type ContentAnalysisDeps = {
  requireScopedAdminVideo: typeof requireScopedAdminVideo;
  generateContentAnalysisForAccess: typeof generateContentAnalysisForAccess;
};

export const defaultContentAnalysisDeps: ContentAnalysisDeps = {
  requireScopedAdminVideo,
  generateContentAnalysisForAccess,
};

export async function buildContentAnalysisResponse(
  request: NextRequest,
  deps: ContentAnalysisDeps = defaultContentAnalysisDeps,
  observation?: Parameters<Parameters<typeof observeMutation>[1]>[0],
) {
  observation?.mark("validate");
  observation?.setDetail?.({ businessSucceeded: false, auditStatus: "skipped", employeeNotificationStatus: "skipped", todoStatus: "skipped", compensationRequired: false, events: [] });
  const finish = (response: Response) => appendObservedMutationResult(response, observation);
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return finish(NextResponse.json({ error: "请求体格式不正确" }, { status: 400 }));
  }
  const videoId = typeof body.video_id === "string" && body.video_id.trim() ? body.video_id.trim() : null;
  if (!videoId) return finish(NextResponse.json({ error: "缺少 video_id" }, { status: 400 }));
  observation?.mark("scope");
  let access: Awaited<ReturnType<typeof requireScopedAdminVideo>>;
  try {
    access = await deps.requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  } catch (error) {
    return finish(NextResponse.json({ error: error instanceof Error ? error.message : "加载视频失败" }, { status: 500 }));
  }
  if ("error" in access) return finish(NextResponse.json({ error: access.error }, { status: access.status }));
  observation?.mark("read");
  try {
    const result = await deps.generateContentAnalysisForAccess(access);
    return finish(NextResponse.json(result));
  } catch (error) {
    if (error instanceof ContentAnalysisError) {
      return finish(NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    return finish(NextResponse.json({ error: error instanceof Error ? error.message : "辅助分析失败", code: "CONTENT_ANALYSIS_FAILED" }, { status: 500 }));
  }
}

export async function POST(request: NextRequest) {
  return observeMutation("/api/admin/content-analysis", async (observation) => {
    return buildContentAnalysisResponse(request, defaultContentAnalysisDeps, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
