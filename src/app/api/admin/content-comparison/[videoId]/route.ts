import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";

const COMPARISON_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at";

const COMPARISON_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares, favorites";

export async function GET(
  _request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (!access.video.account_id || !access.video.published_at) {
    return NextResponse.json({
      video_id: videoId,
      previous_video: null,
      previous_snapshot: null,
    });
  }

  const { data: previousVideo, error: previousError } = await access.supabase
    .from("videos")
    .select(COMPARISON_VIDEO_SELECT)
    .eq("account_id", access.video.account_id)
    .lt("published_at", access.video.published_at)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError) {
    return NextResponse.json({ error: previousError.message || "加载上一条视频失败" }, { status: 500 });
  }

  if (!previousVideo) {
    return NextResponse.json({
      video_id: videoId,
      previous_video: null,
      previous_snapshot: null,
    });
  }

  const { data: previousSnapshot, error: snapshotError } = await access.supabase
    .from("video_metrics_snapshots")
    .select(COMPARISON_SNAPSHOT_SELECT)
    .eq("video_id", previousVideo.id)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message || "加载上一条快照失败" }, { status: 500 });
  }

  return NextResponse.json({
    video_id: videoId,
    previous_video: previousVideo,
    previous_snapshot: previousSnapshot ?? null,
  });
}
