import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  generateNextDayReviewForAccess,
  NextDayReviewError,
} from "@/lib/next-day-review-service";

type RequestBody = { video_id?: string; force_refresh?: boolean };

function errorResponse(message: string, code: string, status = 422) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" && body.video_id.trim() ? body.video_id.trim() : null;
  if (!videoId) return NextResponse.json({ error: "缺少 video_id" }, { status: 400 });

  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await generateNextDayReviewForAccess(access, body.force_refresh === true);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NextDayReviewError) {
      return errorResponse(error.message, error.code, error.status);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 请求失败", code: "REVIEW_FAILED" },
      { status: 500 },
    );
  }
}
