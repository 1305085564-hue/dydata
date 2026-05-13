import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at, accounts!inner(name), profiles!inner(name)";

const CONTENT_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "pending";
  return view === "all" || view === "pending" ? view : null;
}

export async function GET(request: NextRequest) {
  const view = parseView(request);
  if (!view) {
    return NextResponse.json({ error: "view 只能是 pending 或 all" }, { status: 400 });
  }

  const auth = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: reviewedResults }, { data: snapshots }, videosResult] = await Promise.all([
    supabase
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success"),
    supabase
      .from("video_metrics_snapshots")
      .select(CONTENT_SNAPSHOT_SELECT)
      .eq("snapshot_type", "24h")
      .order("captured_at", { ascending: false }),
    supabase
      .from("videos")
      .select(CONTENT_VIDEO_SELECT)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  if (videosResult.error) {
    return NextResponse.json({ error: videosResult.error.message }, { status: 500 });
  }

  const reviewedVideoIds = new Set(
    (reviewedResults ?? [])
      .map((result) => {
        const json = result.result_json as Record<string, unknown> | null;
        return typeof json?.video_id === "string" ? json.video_id : null;
      })
      .filter((id): id is string => id !== null),
  );

  const allVideos = videosResult.data ?? [];
  const videos = view === "pending"
    ? allVideos.filter((video) => {
        const uploadedAt = typeof video.uploaded_at === "string" ? video.uploaded_at : null;
        const createdAt = typeof video.created_at === "string" ? video.created_at : null;
        const sampleAt = uploadedAt ?? createdAt;
        return sampleAt != null && sampleAt >= since24h && !reviewedVideoIds.has(video.id as string);
      })
    : allVideos;

  const videoIds = new Set(videos.map((video) => video.id as string));

  return NextResponse.json({
    data: videos,
    snapshots: (snapshots ?? []).filter((snapshot) => videoIds.has(snapshot.video_id as string)),
    reviewed_video_ids: Array.from(reviewedVideoIds),
    view,
  });
}
