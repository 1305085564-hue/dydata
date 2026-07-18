import { NextRequest, NextResponse } from "next/server";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { runSingleVideoInsight } from "@/lib/ai/insight-single-video";
import { userOwnsContentItem } from "@/lib/api-resource-access";
import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SingleVideoInsightDeps = {
  createClient: typeof createClient;
  userOwnsContentItem: typeof userOwnsContentItem;
  runInsight: typeof runSingleVideoInsight;
};

const defaultDeps: SingleVideoInsightDeps = {
  createClient,
  userOwnsContentItem,
  runInsight: runSingleVideoInsight,
};

export async function buildSingleVideoInsightResponse(
  request: NextRequest,
  deps: SingleVideoInsightDeps = defaultDeps,
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
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const videoId = isRecord(body) && typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!UUID_PATTERN.test(videoId)) {
    return NextResponse.json({ error: "video_id 必须是 uuid" }, { status: 400 });
  }

  if (!await deps.userOwnsContentItem(supabase, videoId, user.id)) {
    return NextResponse.json({ error: "内容不存在或无权限" }, { status: 403 });
  }

  try {
    const result = await deps.runInsight(supabase, videoId);
    return NextResponse.json(result);
  } catch (error) {
    const isNotFound = error instanceof Error && error.message.includes("不存在");
    return NextResponse.json(
      { error: isNotFound ? "内容不存在" : "单视频洞察生成失败" },
      { status: isNotFound ? 404 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return buildSingleVideoInsightResponse(request);
}
