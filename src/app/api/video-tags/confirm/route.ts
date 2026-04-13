import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeAiTagSuggestions, type RawAiTagSuggestion } from "@/lib/video-tags";
import type { VideoTagReviewDimension } from "@/types";

type ConfirmRequestBody = {
  video_id?: string;
  tags?: Array<{
    tag_dimension?: VideoTagReviewDimension;
    tag_value?: string;
    confidence?: number | null;
    reason?: string | null;
  }>;
  action?: "confirm" | "skip";
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: ConfirmRequestBody;

  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  if (!body.video_id) {
    return NextResponse.json({ error: "video_id 为必填项" }, { status: 400 });
  }

  const normalizedTags = normalizeAiTagSuggestions((body.tags ?? []) as RawAiTagSuggestion[]);

  if (!normalizedTags.length) {
    return NextResponse.json({ error: "至少需要一个合法标签" }, { status: 400 });
  }

  if (body.action === "skip") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = normalizedTags.map((tag) => ({
    video_id: body.video_id,
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
    .eq("video_id", body.video_id)
    .in("tag_dimension", dimensions);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "标签确认失败" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("video_tags")
    .insert(payload)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message || "标签确认失败" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tags: data ?? [] });
}
