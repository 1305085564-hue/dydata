import { NextRequest, NextResponse } from "next/server";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import {
  buildSegmentsFromContent,
  saveContentSegments,
} from "@/lib/content-segment-service";
import { userOwnsVideo } from "@/lib/api-resource-access";
import { createClient } from "@/lib/supabase/server";

const MAX_CONTENT_LENGTH = 50_000;
const MAX_DURATION_SECONDS = 3_600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeContent(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type ContentSegmentDeps = {
  createClient: typeof createClient;
  userOwnsVideo: typeof userOwnsVideo;
  buildSegments: typeof buildSegmentsFromContent;
  saveSegments: typeof saveContentSegments;
};

const defaultDeps: ContentSegmentDeps = {
  createClient,
  userOwnsVideo,
  buildSegments: buildSegmentsFromContent,
  saveSegments: saveContentSegments,
};

export async function buildContentSegmentResponse(
  request: NextRequest,
  deps: ContentSegmentDeps = defaultDeps,
) {
  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "请求体必须是对象" }, { status: 400 });
  }
  if (typeof body.content === "string" && body.content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `content 不能超过 ${MAX_CONTENT_LENGTH} 字` }, { status: 400 });
  }
  if (
    body.duration_sec != null &&
    (typeof body.duration_sec !== "number" ||
      !Number.isFinite(body.duration_sec) ||
      body.duration_sec <= 0 ||
      body.duration_sec > MAX_DURATION_SECONDS)
  ) {
    return NextResponse.json({ error: `duration_sec 必须是 0-${MAX_DURATION_SECONDS} 秒` }, { status: 400 });
  }

  const directContent = normalizeContent(body.content);
  const videoId = normalizeContent(body.video_id);
  const durationSec = typeof body.duration_sec === "number" ? body.duration_sec : null;

  if (!directContent && !videoId) {
    return NextResponse.json({ error: "video_id 和 content 至少传一个" }, { status: 400 });
  }
  if (videoId && !UUID_PATTERN.test(videoId)) {
    return NextResponse.json({ error: "video_id 必须是 uuid" }, { status: 400 });
  }
  if (videoId && !await deps.userOwnsVideo(supabase, videoId, user.id)) {
    return NextResponse.json({ error: "视频不存在或无权限" }, { status: 403 });
  }

  let content = directContent;
  if (!content && videoId) {
    const { data: video, error } = await supabase
      .from("videos")
      .select("id, content")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (error || !video) {
      return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });
    }
    content = normalizeContent(video.content);
  }

  if (!content) {
    return NextResponse.json({ error: "文案为空，无法切段" }, { status: 400 });
  }

  let built;
  try {
    built = await deps.buildSegments(content, durationSec);
  } catch {
    return NextResponse.json({ error: "AI 未返回有效切段结果" }, { status: 502 });
  }

  if (videoId) {
    try {
      await deps.saveSegments(supabase, videoId, built.segments);
    } catch {
      return NextResponse.json({ error: "切段保存失败" }, { status: 500 });
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

export async function POST(request: NextRequest) {
  return buildContentSegmentResponse(request);
}
