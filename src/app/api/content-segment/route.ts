import { NextRequest, NextResponse } from "next/server";

import {
  buildSegmentsFromContent,
  saveContentSegments,
} from "@/lib/content-segment-service";
import { createClient } from "@/lib/supabase/server";

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

  let built;
  try {
    built = await buildSegmentsFromContent(content, durationSec);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 未返回有效切段结果" },
      { status: 502 },
    );
  }

  if (videoId) {
    try {
      await saveContentSegments(supabase, videoId, built.segments);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "切段保存失败" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    video_id: videoId,
    duration_sec: built.duration_sec,
    segments: built.segments.map((segment) => ({
      type: segment.segment_type,
      text: segment.segment_text,
      estimatedStartSec: segment.estimated_start_sec,
      estimatedEndSec: segment.estimated_end_sec,
      segment_order: segment.segment_order,
      segment_type: segment.segment_type,
      segment_text: segment.segment_text,
      estimated_start_sec: segment.estimated_start_sec,
      estimated_end_sec: segment.estimated_end_sec,
    })),
  });
}
