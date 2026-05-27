import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyContentSegmentsWithAi,
  splitContentIntoBusinessParagraphs,
} from "@/lib/content-segmentation";
import { estimateSegmentTimeline } from "@/lib/timeline-alignment";

export type ContentSegmentRow = {
  segment_order: number;
  segment_type: string;
  segment_text: string;
  estimated_start_sec: number | null;
  estimated_end_sec: number | null;
};

export type EnsureContentSegmentsResult = {
  segments: ContentSegmentRow[];
  generated: boolean;
  duration_sec: number;
};

function normalizeContent(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function estimateDuration(content: string, durationSec?: number | null) {
  return durationSec && Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : Math.max(content.replace(/\s+/g, "").length / 3.5, 8);
}

export async function buildSegmentsFromContent(content: string, durationSec?: number | null) {
  const normalizedContent = normalizeContent(content);
  if (!normalizedContent) {
    throw new Error("文案为空，无法切段");
  }

  const paragraphs = splitContentIntoBusinessParagraphs(normalizedContent);
  if (!paragraphs.length) {
    throw new Error("文案为空，无法切段");
  }

  const segments = await classifyContentSegmentsWithAi(paragraphs);
  if (!segments.length) {
    throw new Error("AI 未返回有效切段结果");
  }

  const duration = estimateDuration(normalizedContent, durationSec);
  const alignedSegments = estimateSegmentTimeline(segments, duration);

  return {
    duration_sec: duration,
    segments: alignedSegments.map((segment, index) => ({
      segment_order: index,
      segment_type: segment.type,
      segment_text: segment.text,
      estimated_start_sec: segment.estimatedStartSec,
      estimated_end_sec: segment.estimatedEndSec,
    })),
  };
}

export async function loadContentSegments(
  supabase: Pick<SupabaseClient, "from">,
  videoId: string,
): Promise<ContentSegmentRow[]> {
  const { data } = await supabase
    .from("video_content_segments")
    .select("segment_order,segment_type,segment_text,estimated_start_sec,estimated_end_sec")
    .eq("video_id", videoId)
    .order("segment_order", { ascending: true });

  return (data ?? []).map((segment) => ({
    segment_order: segment.segment_order ?? 0,
    segment_type: segment.segment_type ?? "其他",
    segment_text: segment.segment_text ?? "",
    estimated_start_sec: segment.estimated_start_sec ?? null,
    estimated_end_sec: segment.estimated_end_sec ?? null,
  }));
}

export async function saveContentSegments(
  supabase: Pick<SupabaseClient, "from">,
  videoId: string,
  segments: ContentSegmentRow[],
) {
  const { error: deleteError } = await supabase.from("video_content_segments").delete().eq("video_id", videoId);
  if (deleteError) {
    throw new Error(deleteError.message || "旧切段删除失败");
  }

  const insertPayload = segments.map((segment, index) => ({
    video_id: videoId,
    segment_type: segment.segment_type,
    segment_text: segment.segment_text,
    segment_order: index,
    estimated_start_sec: segment.estimated_start_sec,
    estimated_end_sec: segment.estimated_end_sec,
  }));

  const { error: insertError } = await supabase.from("video_content_segments").insert(insertPayload);
  if (insertError) {
    throw new Error(insertError.message || "切段保存失败");
  }
}

export async function ensureContentSegments(params: {
  supabase: Pick<SupabaseClient, "from">;
  videoId: string;
  content: string | null | undefined;
  durationSec?: number | null;
  forceRefresh?: boolean;
}): Promise<EnsureContentSegmentsResult> {
  const existing = params.forceRefresh ? [] : await loadContentSegments(params.supabase, params.videoId);
  if (existing.length) {
    return {
      segments: existing,
      generated: false,
      duration_sec: estimateDuration(params.content ?? "", params.durationSec),
    };
  }

  const built = await buildSegmentsFromContent(params.content ?? "", params.durationSec);
  await saveContentSegments(params.supabase, params.videoId, built.segments);

  return {
    ...built,
    generated: true,
  };
}
