import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";

const COMPARISON_VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at";

const COMPARISON_SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain, likes, comments, shares, favorites";

type MetricRow = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

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
    return NextResponse.json({ video_id: videoId, previous: null, yesterday: null, three_days: null });
  }

  const publishedAt = access.video.published_at;
  const accountId = access.video.account_id;
  const supabase = access.supabase;

  // Fetch: previous 1 video + recent 3 videos (for "近3条" average)
  const [prevResult, recent3Result] = await Promise.all([
    supabase
      .from("videos")
      .select(COMPARISON_VIDEO_SELECT)
      .eq("account_id", accountId)
      .lt("published_at", publishedAt)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("videos")
      .select("id, published_at")
      .eq("account_id", accountId)
      .neq("id", videoId)
      .lt("published_at", publishedAt)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  const previousVideo = prevResult.data;
  const recent3Videos: { id: string; published_at: string }[] = recent3Result.data ?? [];

  // Collect all video IDs that need snapshots
  const snapshotVideoIds = new Set<string>();
  if (previousVideo) snapshotVideoIds.add(previousVideo.id);
  recent3Videos.forEach((v) => snapshotVideoIds.add(v.id));

  type SnapshotData = {
    video_id: string;
  } & MetricRow;

  const snapshotMap = new Map<string, SnapshotData>();
  if (snapshotVideoIds.size > 0) {
    const { data: snapshots } = await supabase
      .from("video_metrics_snapshots")
      .select(COMPARISON_SNAPSHOT_SELECT)
      .in("video_id", Array.from(snapshotVideoIds))
      .eq("snapshot_type", "24h");
    if (snapshots) {
      for (const s of snapshots) {
        const row = s as unknown as SnapshotData;
        if (!snapshotMap.has(row.video_id)) snapshotMap.set(row.video_id, row);
      }
    }
  }

  // Previous
  const prevSnapshot = previousVideo ? snapshotMap.get(previousVideo.id) ?? null : null;
  const previous = prevSnapshot ? toMetricRow(prevSnapshot) : null;

  // Recent 3 average
  const recent3 = computeAverage(recent3Videos.map((v) => snapshotMap.get(v.id)).filter((s): s is SnapshotData => s !== undefined));

  return NextResponse.json({
    video_id: videoId,
    previous: previous
      ? { ...previous, title: previousVideo?.video_title || null, published_at: previousVideo?.published_at }
      : null,
    recent3: recent3 ? { ...recent3, count: recent3Videos.length } : null,
  });
}

function toMetricRow(s: MetricRow): MetricRow {
  return {
    play_count: s.play_count,
    bounce_rate_2s: s.bounce_rate_2s,
    completion_rate_5s: s.completion_rate_5s,
    completion_rate: s.completion_rate,
    avg_play_duration: s.avg_play_duration,
    follower_gain: s.follower_gain,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    favorites: s.favorites,
  };
}

function computeAverage(snapshots: MetricRow[]): MetricRow | null {
  if (snapshots.length === 0) return null;
  const keys: (keyof MetricRow)[] = [
    "play_count", "bounce_rate_2s", "completion_rate_5s", "completion_rate",
    "avg_play_duration", "follower_gain", "likes", "comments", "shares", "favorites",
  ];
  const result: Record<string, number | null> = {};
  for (const key of keys) {
    const values = snapshots.map((s) => s[key]).filter((v): v is number => v != null);
    result[key] = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null;
  }
  return result as unknown as MetricRow;
}
