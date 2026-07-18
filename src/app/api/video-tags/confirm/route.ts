import { NextRequest, NextResponse } from "next/server";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { userOwnsVideo } from "@/lib/api-resource-access";
import { createClient } from "@/lib/supabase/server";
import { normalizeAiTagSuggestions, type RawAiTagSuggestion } from "@/lib/video-tags";

const MAX_TAG_SUGGESTIONS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type VideoTagsConfirmDeps = {
  createClient: typeof createClient;
  userOwnsVideo: typeof userOwnsVideo;
};

const defaultDeps: VideoTagsConfirmDeps = {
  createClient,
  userOwnsVideo,
};

export async function buildVideoTagsConfirmResponse(
  request: NextRequest,
  deps: VideoTagsConfirmDeps = defaultDeps,
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

  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!UUID_PATTERN.test(videoId)) {
    return NextResponse.json({ error: "video_id 必须是 uuid" }, { status: 400 });
  }
  if (!Array.isArray(body.tags) || body.tags.length === 0 || body.tags.length > MAX_TAG_SUGGESTIONS) {
    return NextResponse.json({ error: `tags 必须是 1-${MAX_TAG_SUGGESTIONS} 个标签` }, { status: 400 });
  }

  const action = body.action ?? "confirm";
  if (action !== "confirm" && action !== "skip") {
    return NextResponse.json({ error: "action 只支持 confirm 或 skip" }, { status: 400 });
  }

  const normalizedTags = normalizeAiTagSuggestions(body.tags as RawAiTagSuggestion[]);
  if (!normalizedTags.length) {
    return NextResponse.json({ error: "至少需要一个合法标签" }, { status: 400 });
  }
  if (!await deps.userOwnsVideo(supabase, videoId, user.id)) {
    return NextResponse.json({ error: "视频不存在或无权限" }, { status: 403 });
  }

  if (action === "skip") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = normalizedTags.map((tag) => ({
    video_id: videoId,
    tag_dimension: tag.tag_dimension,
    tag_value: tag.tag_value,
    source: "manual" as const,
    confidence: tag.confidence,
    reason: tag.reason,
    reviewed_by: user.id,
  }));
  const dimensions = [...new Set(payload.map((tag) => tag.tag_dimension))];

  const { error: deleteError } = await supabase
    .from("video_tags")
    .delete()
    .eq("video_id", videoId)
    .in("tag_dimension", dimensions);
  if (deleteError) {
    return NextResponse.json({ error: "标签确认失败" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("video_tags")
    .insert(payload)
    .select("id, video_id, tag_dimension, tag_value, source, confidence, reason, reviewed_by, created_at");
  if (error) {
    return NextResponse.json({ error: "标签确认失败" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tags: data ?? [] });
}

export async function POST(request: NextRequest) {
  return buildVideoTagsConfirmResponse(request);
}
