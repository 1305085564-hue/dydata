import { NextRequest, NextResponse } from "next/server";

import {
  classifyContentSegmentsWithAi,
  splitContentIntoBusinessParagraphs,
} from "@/lib/content-segmentation";
import { createClient } from "@/lib/supabase/server";
import { estimateSegmentTimeline } from "@/lib/timeline-alignment";

type RequestBody = {
  video_id?: string;
  content?: string;
  duration_sec?: number;
};

function normalizeContent(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const directContent = normalizeContent(body.content);
  const videoId = normalizeContent(body.video_id);
  const durationSec = normalizeDuration(body.duration_sec);

  if (!directContent && !videoId) {
    return NextResponse.json({ error: "video_id 和 content 至少传一个" }, { status: 400 });
  }

  let content = directContent;

  if (!content && videoId) {
    const { data: video, error } = await supabase.from("videos").select("id, content").eq("id", videoId).single();

    if (error || !video) {
      return NextResponse.json({ error: error?.message || "视频不存在" }, { status: 404 });
    }

    content = normalizeContent(video.content);
  }

  if (!content) {
    return NextResponse.json({ error: "文案为空，无法切段" }, { status: 400 });
  }

  const paragraphs = splitContentIntoBusinessParagraphs(content);
  if (!paragraphs.length) {
    return NextResponse.json({ error: "文案为空，无法切段" }, { status: 400 });
  }

  const segments = await classifyContentSegmentsWithAi(paragraphs);
  if (!segments.length) {
    return NextResponse.json({ error: "AI 未返回有效切段结果" }, { status: 502 });
  }

  const estimatedDuration = durationSec ?? Math.max(content.replace(/\s+/g, "").length / 3.5, 8);
  const alignedSegments = estimateSegmentTimeline(segments, estimatedDuration);

  if (videoId) {
    const { error: deleteError } = await supabase.from("video_content_segments").delete().eq("video_id", videoId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message || "旧切段删除失败" }, { status: 500 });
    }

    const insertPayload = alignedSegments.map((segment, index) => ({
      video_id: videoId,
      segment_type: segment.type,
      segment_text: segment.text,
      segment_order: index,
      estimated_start_sec: segment.estimatedStartSec,
      estimated_end_sec: segment.estimatedEndSec,
    }));

    const { error: insertError } = await supabase.from("video_content_segments").insert(insertPayload);
    if (insertError) {
      return NextResponse.json({ error: insertError.message || "切段保存失败" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    video_id: videoId,
    duration_sec: estimatedDuration,
    segments: alignedSegments,
  });
}
