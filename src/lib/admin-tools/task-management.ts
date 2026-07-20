import { createAdminClient } from "@/lib/supabase/admin";
import { classifyContentSegmentsWithAi, splitContentIntoBusinessParagraphs } from "@/lib/content-segmentation";
import { estimateSegmentTimeline } from "@/lib/timeline-alignment";
import type { ToolExecutionResult } from "./types";
import { toOptionalString, toDateString, toStringArray, toSafeString } from "./utils";

export async function retryContentBreakdown(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const contentItemId = toOptionalString(params.contentItemId);
  if (!contentItemId) return { success: false, error: "缺少 contentItemId" };

  const service = createAdminClient();
  const { data: video } = await service.from("videos").select("id, content").eq("lifecycle_state", "active").eq("id", contentItemId).single();
  if (!video?.content?.trim()) return { success: false, error: "文案为空，无法重跑" };

  const paragraphs = splitContentIntoBusinessParagraphs(video.content);
  if (!paragraphs.length) return { success: false, error: "文案分段失败" };

  const segments = await classifyContentSegmentsWithAi(paragraphs);
  if (!segments.length) return { success: false, error: "AI 未返回可用拆段" };

  const aligned = estimateSegmentTimeline(segments, Math.max(video.content.replace(/\s+/g, "").length / 3.5, 8));

  const backupSql = `INSERT INTO video_content_segments_backup SELECT * FROM video_content_segments WHERE video_id='${contentItemId}';`;
  if (dryRun) {
    return {
      success: true,
      backupSql,
      affectedData: { contentItemId, segmentCount: aligned.length },
    };
  }

  const { error: delError } = await service.from("video_content_segments").delete().eq("video_id", contentItemId);
  if (delError) return { success: false, error: delError.message, backupSql };

  const { error: insertError } = await service.from("video_content_segments").insert(
    aligned.map((segment, index) => ({
      video_id: contentItemId,
      segment_type: segment.type,
      segment_text: segment.text,
      segment_order: index,
      estimated_start_sec: segment.estimatedStartSec,
      estimated_end_sec: segment.estimatedEndSec,
    })),
  );

  if (insertError) return { success: false, error: insertError.message, backupSql };

  return { success: true, data: { contentItemId, segmentCount: aligned.length }, backupSql };
}

export async function retryDailyReview(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const videoIds = toStringArray(params.videoIds);
  const userId = toOptionalString(params.userId);
  const date = toDateString(params.date);

  const service = createAdminClient();

  let targets = videoIds;
  if (!targets.length && userId && date) {
    const { data: videos } = await service
      .from("videos")
      .select("id")
      .eq("lifecycle_state", "active")
      .eq("user_id", userId)
      .gte("created_at", `${date}T00:00:00.000Z`)
      .lte("created_at", `${date}T23:59:59.999Z`)
      .limit(50);
    targets = (videos ?? []).map((v) => v.id);
  }

  if (!targets.length) return { success: false, error: "未找到可重跑视频" };

  const backupSql = `INSERT INTO ai_insight_result_backup SELECT * FROM ai_insight_result WHERE insight_type='next_day_review';`;
  if (dryRun) return { success: true, backupSql, affectedData: { targetCount: targets.length, videoIds: targets } };

  const { error } = await service
    .from("ai_insight_result")
    .delete()
    .eq("insight_type", "next_day_review")
    .in("result_json->>video_id", targets as unknown as never[]);

  if (error) return { success: false, error: error.message, backupSql };

  return { success: true, data: { clearedForRetry: targets }, backupSql };
}

export async function clearCache(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const cacheType = toSafeString(params.cacheType) as "all" | "user_metrics" | "leaderboard" | "analytics";
  if (!cacheType) return { success: false, error: "缺少 cacheType" };

  const service = createAdminClient();

  if (dryRun) {
    return {
      success: true,
      backupSql: "-- 该操作会删除分析结果数据，无直接回滚 SQL，请使用重算或备份恢复",
      affectedData: { cacheType, note: "将删除分析结果表数据，不是内存缓存" },
    };
  }

  if (cacheType === "all" || cacheType === "analytics") {
    await service.from("ai_insight_result").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  if (cacheType === "all" || cacheType === "leaderboard") {
    await service.from("account_leaderboard_rows").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  return { success: true, data: { cacheType } };
}
