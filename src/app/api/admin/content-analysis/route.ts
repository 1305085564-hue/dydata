import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  ContentAnalysisError,
  generateContentAnalysisForAccess,
} from "@/lib/content-analysis-service";

type RequestBody = {
  video_id?: string;
};

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" && body.video_id.trim() ? body.video_id.trim() : null;
  if (!videoId) {
    return NextResponse.json({ error: "缺少 video_id" }, { status: 400 });
  }

  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await generateContentAnalysisForAccess(access);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ContentAnalysisError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "辅助分析失败", code: "CONTENT_ANALYSIS_FAILED" },
      { status: 500 },
    );
  }
}
