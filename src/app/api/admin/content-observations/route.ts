import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  loadContentObservation,
  saveContentObservation,
  type ContentObservationInput,
} from "@/lib/content-observations";

type ContentObservationDeps = {
  requireScopedAdminVideo: typeof requireScopedAdminVideo;
  loadContentObservation: typeof loadContentObservation;
  saveContentObservation: typeof saveContentObservation;
};

const defaultDeps: ContentObservationDeps = {
  requireScopedAdminVideo,
  loadContentObservation,
  saveContentObservation,
};

function getVideoIdFromBody(body: Record<string, unknown>) {
  const value = body.videoId ?? body.video_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function buildContentObservationGetResponse(
  videoId: string | null,
  deps: ContentObservationDeps = defaultDeps,
) {
  if (!videoId) {
    return NextResponse.json({ error: "缺少 videoId" }, { status: 400 });
  }

  const access = await deps.requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const observation = await deps.loadContentObservation({
      supabase: access.supabase,
      videoId,
      observerId: access.actor.userId,
    });

    return NextResponse.json({ video_id: videoId, observation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载观察记录失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function buildContentObservationPostResponse(
  body: Record<string, unknown>,
  deps: ContentObservationDeps = defaultDeps,
) {
  const videoId = getVideoIdFromBody(body);
  if (!videoId) {
    return NextResponse.json({ error: "缺少 videoId" }, { status: 400 });
  }

  const access = await deps.requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const observation = await deps.saveContentObservation({
      supabase: access.supabase,
      videoId,
      observerId: access.actor.userId,
      input: body as ContentObservationInput,
    });

    return NextResponse.json({ ok: true, video_id: videoId, observation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存观察记录失败";
    const status = message.includes("枚举值不正确") || message.includes("只能是") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId") ?? request.nextUrl.searchParams.get("video_id");
  return buildContentObservationGetResponse(videoId);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
    }
    body = rawBody as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  return buildContentObservationPostResponse(body);
}
