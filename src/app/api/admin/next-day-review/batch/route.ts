import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  generateNextDayReviewForAccess,
  NextDayReviewError,
} from "@/lib/next-day-review-service";

type RequestBody = {
  video_ids?: unknown;
  force_refresh?: boolean;
};

const MAX_BATCH_SIZE = 20;

function normalizeVideoIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, MAX_BATCH_SIZE);
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const videoIds = normalizeVideoIds(body.video_ids);
  if (!videoIds.length) {
    return NextResponse.json({ error: "缺少 video_ids" }, { status: 400 });
  }

  const results = [];
  for (const videoId of videoIds) {
    const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
    if ("error" in access) {
      results.push({
        video_id: videoId,
        ok: false,
        code: "ACCESS_DENIED",
        error: access.error,
      });
      continue;
    }

    try {
      const review = await generateNextDayReviewForAccess(access, body.force_refresh === true);
      results.push({
        video_id: videoId,
        ok: true,
        cached: review.cached,
        auto_segmented: review.auto_segmented,
        feedback_card: review.feedback_card,
      });
    } catch (error) {
      results.push({
        video_id: videoId,
        ok: false,
        code: error instanceof NextDayReviewError ? error.code : "REVIEW_FAILED",
        error: error instanceof Error ? error.message : "复盘失败",
      });
    }
  }

  const successCount = results.filter((item) => item.ok).length;

  return NextResponse.json({
    ok: successCount > 0,
    total: results.length,
    success_count: successCount,
    failed_count: results.length - successCount,
    results,
  });
}
