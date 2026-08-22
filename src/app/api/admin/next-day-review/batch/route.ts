import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  generateNextDayReviewForAccess,
  NextDayReviewError,
} from "@/lib/next-day-review-service";
import { measureAsync } from "@/lib/perf";

type RequestBody = {
  video_ids?: unknown;
  force_refresh?: boolean;
};

const MAX_BATCH_SIZE = 20;
// AI 生成是重调用：有上限并发，避免串行拖满整批耗时，也禁止无限 Promise.all 打爆上游
const BATCH_CONCURRENCY = 3;

type BatchResultItem = Awaited<ReturnType<typeof processOne>>;

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

async function processOne(videoId: string, forceRefresh: boolean) {
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return {
      video_id: videoId,
      ok: false,
      code: "ACCESS_DENIED",
      error: access.error,
    };
  }

  try {
    const review = await generateNextDayReviewForAccess(access, forceRefresh);
    return {
      video_id: videoId,
      ok: true,
      cached: review.cached,
      auto_segmented: review.auto_segmented,
      feedback_card: review.feedback_card,
    };
  } catch (error) {
    return {
      video_id: videoId,
      ok: false,
      code: error instanceof NextDayReviewError ? error.code : "REVIEW_FAILED",
      error: error instanceof Error ? error.message : "复盘失败",
    };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
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

  const forceRefresh = body.force_refresh === true;

  const results = await measureAsync("next-day-review.batch", async () => {
    const settled: BatchResultItem[] = new Array(videoIds.length);
    await runWithConcurrency(videoIds, BATCH_CONCURRENCY, async (videoId, index) => {
      settled[index] = await processOne(videoId, forceRefresh);
    });
    return settled;
  });

  const successCount = results.filter((item) => item.ok).length;

  return NextResponse.json({
    ok: successCount > 0,
    total: results.length,
    success_count: successCount,
    failed_count: results.length - successCount,
    results,
  });
}
